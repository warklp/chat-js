# Thread Runtime Architecture

## Design goal

Can a canonical message tree support concurrent branch streams while reusing AI
SDK's message-stream behavior instead of copying or approximating it?

Run the architecture and compatibility coverage with:

```bash
bun --filter @chatjs/thread test
```

The tests run against the AI SDK versions installed by the workspace lockfile.

## AI SDK surfaces

### `ai`

`ChatTransport` is only the network boundary. It accepts a linear path and
returns a `ReadableStream<UIMessageChunk>`. `DefaultChatTransport` implements
HTTP and SSE parsing, while `DirectChatTransport` invokes an agent in-process.

`AbstractChat` owns the client request lifecycle above the transport:

- user message creation and replacement
- response status and cancellation
- UI message stream reduction
- serialized updates
- metadata and data schema handling
- `onData`, `onToolCall`, `onFinish`, and `onError`
- tool output and approval mutation
- `sendAutomaticallyWhen`
- reconnection

`readUIMessageStream` is a supported public reducer. It converts a stream of
`UIMessageChunk` values into successive, accumulated `UIMessage` snapshots,
including text, reasoning, tools, sources, files, and data parts.

Other useful public surfaces include:

- `createUIMessageStream` and `UIMessageStreamWriter` for producing or merging
  UI streams
- `validateUIMessages` and `safeValidateUIMessages` for persistence boundaries
- `convertToModelMessages` for server/model conversion
- `lastAssistantMessageIsCompleteWithToolCalls` and
  `lastAssistantMessageIsCompleteWithApprovalResponses` for automatic sends
- `uiMessageChunkSchema` for protocol validation

Primary installed sources:

- `ai/dist/index.d.ts`: `ChatTransport`, `ChatState`, `AbstractChat`, and the
  exported helpers
- `ai/docs/04-ai-sdk-ui/24-reading-ui-message-streams.mdx`:
  `readUIMessageStream` examples and tool handling
- `ai/docs/07-reference/02-ai-sdk-ui/40-create-ui-message-stream.mdx`:
  stream creation, merging, error handling, and finish callbacks

### `@ai-sdk/react`

The React package is deliberately thin:

- `Chat` extends `AbstractChat` with a reactive `ChatState`.
- `useChat` creates or accepts a `Chat` instance.
- `useSyncExternalStore` subscribes to message, status, and error callbacks.
- Message throttling happens at the React subscription boundary.

`Chat` and its three subscription methods are public exports. They are useful
for understanding the React contract, but they do not solve tree ownership or
multi-stream concurrency.

Primary installed source:

- `@ai-sdk/react/dist/index.d.ts` and `dist/index.mjs`

## Alternatives evaluated

### Per-stream `AbstractChat`

The existing `ThreadRuntime` already uses this design. Every active response
gets an isolated `TreeStreamChat extends AbstractChat` and a tree-backed
`ThreadChatState`.

```text
ThreadRuntime (canonical tree)
  -> stream registry
     -> TreeStreamChat A -> shared ChatTransport
     -> TreeStreamChat B -> shared ChatTransport
```

The integration suite proves:

- Rich text, reasoning, tool, and data output matches `@ai-sdk/react`'s `Chat`
  for the same chunk sequence.
- Two streams can update separate leaves concurrently through one transport.
- Interleaved updates continue on hidden branches after cursor changes.
- Stopping one stream does not abort another stream.
- The runtime can enforce a reserved assistant ID even if the server sends a
  different start ID.
- AI SDK still invokes `onData` and `onToolCall` through the branch engine.

This approach reuses AI SDK's complete orchestration behavior. The package owns
tree topology, cursor selection, stream registration, and identity binding.

### Direct `readUIMessageStream`

The integration suite also proves that the public reducer correctly accumulates:

- text and reasoning parts
- dynamic tool input and output
- custom data parts
- the assistant message identity from the stream's `start` chunk

This is a solid public primitive and a useful fallback if `AbstractChat` becomes
unsuitable. However, it only reduces a stream. A runtime built directly on it
would still need to implement:

- request statuses and errors
- abort controller ownership
- `onData` and `onToolCall` dispatch
- tool output and approval mutations
- `sendAutomaticallyWhen`
- regeneration and reconnection
- serialized request jobs
- finish callback parity

It also accepts a server-provided start ID over a supplied assistant shell ID.
The tree runtime would need an explicit ID reconciliation policy.

## Recommendation

Keep the canonical tree and the per-stream `AbstractChat` engines for the first
package architecture. Do not introduce a custom "AI SDK transport adapter" and
do not manually parse `UIMessageChunk` values.

The user's `ChatTransport` should pass through unchanged. Tree request context
belongs in `ChatRequestOptions.body` and is optional for transports such as
`DirectChatTransport` that ignore HTTP request bodies.

The internal concepts should be named explicitly:

```ts
type BranchRun = {
  assistantMessageId: string;
  chat: AbstractChat<UIMessage>;
  originCursorId: string | null;
  streamId: string;
  userMessageId: string;
};
```

```text
ThreadRuntime
  owns nodes, edges, cursor, and BranchRun registry

BranchRun
  owns one AI SDK request lifecycle and one AbortController

ChatTransport
  remains the user-provided AI SDK network implementation
```

`readUIMessageStream` should remain a documented alternative, not the initial
engine.

## Implementation follow-up

The package now routes tool output and approval responses to durable runs,
reconciles `setMessages` without deleting hidden branches, and exposes AI SDK
statuses per run. Runs use their assistant message ID as identity. HTTP
reconnection should route that message ID through
`prepareReconnectToStreamRequest`; the server can then resolve its private
resumable stream ID.

Remaining differential coverage should focus on metadata schemas, malformed
streams, and abort timing.

## Decision

The high-confidence boundary is:

> Canonical tree state plus one isolated `AbstractChat` engine per active
> branch request, using the caller's `ChatTransport` directly.

This avoids both failure modes we wanted to eliminate: one global linear chat
state pretending to be a tree, and a custom copy of AI SDK's stream reducer.
