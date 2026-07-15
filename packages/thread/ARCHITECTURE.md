# Thread Architecture

## Target

`@chatjs/thread` adds branching and concurrent responses to the AI SDK chat
model without reimplementing the AI SDK request lifecycle.

The architecture has three layers:

```text
useThread (React compatibility facade)
  -> ThreadChat (canonical conversation tree)
     -> RunRecord A -> ThreadRunChat A -> ChatTransport
     -> RunRecord B -> ThreadRunChat B -> ChatTransport
```

Applications use one `ThreadChat` per conversation. `useThread` owns or
accepts that chat and exposes the active path through a `useChat`-compatible
interface. Tree navigation and parallel-run controls are exposed under
`chat.tree`.

## State Ownership

### `ThreadChat`

`ThreadChat` is the canonical state owner. It stores:

- messages by ID
- parent and child edges
- the active cursor
- run records and per-run status
- tool-call and approval ownership
- concurrency limits
- the observable snapshot consumed by React

The tree is independent of rendering. The active linear chat history is
derived from it:

```ts
messages = chat.getPath(cursorId);
```

Changing the cursor selects another path or an ancestor slice. It does not
delete hidden descendants or stop streams on other branches.

### `RunRecord`

Each assistant response has one run identity and one isolated AI SDK chat
engine:

```ts
type RunRecord<TMessage extends UIMessage> = {
	aborted: boolean;
	chat: ThreadRunChat<TMessage>;
	error: Error | undefined;
	finished: Promise<void>;
	spec: ThreadRunSpec;
	status: ChatStatus;
};
```

The assistant message ID is also the run ID. This gives requests, stream
updates, stop operations, reconnection, tool output, and rendered response
cards one stable identity.

Completed records are currently retained as conversation run history and to
support later run operations. A bounded retention policy can be added without
changing tree ownership.

### `ThreadRunChat`

`ThreadRunChat` is an internal adapter, not a second public chat model. It
extends AI SDK's `AbstractChat` for one branch and delegates its state to a
`ThreadChatState` backed by `ThreadChat`.

This lets the package reuse AI SDK behavior for:

- request status and cancellation
- UI message stream reduction
- serialized updates
- metadata and data schemas
- `onData`, `onToolCall`, `onFinish`, and `onError`
- tool output and approval mutation
- `sendAutomaticallyWhen`
- regeneration and reconnection

`ThreadChatState` presents the run's linear path to `AbstractChat`. Assistant
writes are rebound to the run's reserved assistant ID and committed to the
shared tree. A stream therefore keeps updating its branch even when that branch
is not selected in the UI.

### `ChatTransport`

The caller's AI SDK `ChatTransport` remains the request/stream implementation.
The package does not introduce a new wire protocol or manually parse
`UIMessageChunk` values.

Each `ThreadRunChat` uses a delegating transport so later requests and
reconnections use the latest transport configured on `ThreadChat`. The
request receives only the selected linear path plus optional tree context in
`ChatRequestOptions.body`.

## Request Lifecycle

A send from the active path follows this sequence:

1. Resolve the origin from the explicit `tree.from` value or active cursor.
2. Create or update the user message under that origin.
3. Reserve an assistant message ID and create its tree node.
4. Create a `RunRecord` with an isolated `ThreadRunChat`.
5. Send the selected path through the caller's `ChatTransport`.
6. Commit streamed assistant snapshots to the reserved tree node.
7. Publish status and finish events for that run.
8. Move the cursor with the run only when `follow` is enabled.

Starting multiple runs from the same user message creates assistant siblings.
Starting runs from different leaves streams into those leaves concurrently.
Each run has its own AI SDK state and abort controller, so stopping or hiding
one run does not affect another.

## React Contract

`useThread` is a strict superset of `useChat` for the selected path:

```ts
const chat = useThread({ transport });

chat.messages;
chat.status;
chat.error;
chat.sendMessage({ text: "Continue" });
chat.stop();

chat.tree.cursorId;
chat.tree.setCursor(messageId);
chat.tree.getChildren(messageId);
chat.tree.startRun({ from: messageId });
chat.tree.stopRun(runId);
```

The standard fields describe only the selected path. Aggregate state and
branch operations live under `chat.tree`, including `tree.status`,
`tree.activeRuns`, and `tree.runs`.

## Persistence Boundary

The chat exports and restores serializable tree state:

- `messagesById`
- `parentById`
- `childrenByParentId`
- `rootIds`
- `cursorId`

Applications persist that snapshot with their conversation data. Active
request machinery is process-local and is not serialized. Restoring a tree
therefore requires no reconstruction of completed `AbstractChat` instances;
reconnection creates the run adapter needed for the selected assistant.

## Guarantees

The integration suite verifies that:

- rich text, reasoning, tool, and data output matches `@ai-sdk/react`'s `Chat`
  for the same stream
- concurrent streams update separate leaves
- hidden branches continue receiving interleaved updates
- cursor changes do not reorder or duplicate messages
- stopping one run does not abort another
- tool output and approvals route to their owning run
- finish callbacks receive the committed assistant path
- transport replacement applies to resumed runs

Run the package coverage with:

```bash
bun --filter @chatjs/thread test
```

## Boundaries

The package owns tree topology, cursor selection, run registration, and
identity binding. AI SDK owns each request lifecycle and stream semantics. The
application owns persistence, server-side conversation authorization, model
selection, and presentation such as sibling switchers or parallel response
cards.

This division avoids a global linear chat pretending to be a tree and avoids a
custom copy of AI SDK's stream reducer.
