# External `useChat({ chat })` Spike

## Question

Can `useThread` reuse `@ai-sdk/react`'s `useChat` hook by passing an externally
owned chat object that projects thread state as a linear active path?

Tested against the workspace's installed versions:

- `@ai-sdk/react@3.0.221`
- `ai@6.0.219`

Run the spike with:

```bash
bun run spike:external-chat
```

## Verdict

Yes, with a concrete `Chat` facade over `ThreadRuntime`.

The facade must extend `@ai-sdk/react`'s public `Chat` class, delegate the
standard chat operations to `ThreadRuntime`, expose the selected path through
its `messages` getter, and replace the three React subscription methods with
runtime subscriptions.

```text
useThread
  ├── useChat({ chat: ThreadChatFacade })
  │     └── standard useChat-compatible active-path helpers
  └── ThreadRuntime subscription
        └── tree state and branch controls
```

The facade does not replace the runtime's per-run engines. One isolated
`AbstractChat` is still required for every concurrent assistant response.

## What `useChat({ chat })` actually requires

The public `UseChatOptions` type accepts the concrete React `Chat`, not a base
`AbstractChat` or a general chat interface:

```ts
type UseChatOptions<M extends UIMessage> =
  | { chat: Chat<M> }
  | ChatInit<M>;
```

At runtime, `useChat` reads the object's standard properties and calls three
React-specific subscription methods:

```ts
chat["~registerMessagesCallback"](listener, throttleWaitMs);
chat["~registerStatusCallback"](listener);
chat["~registerErrorCallback"](listener);
```

An `AbstractChat` subclass does not have those methods and is rejected by the
public TypeScript API. An arbitrary structural object could work after a cast,
but that would rely on implementation details without type support.

## Facade behavior proven by the spike

The test passes a `ThreadChatFacade extends Chat` directly to `useChat` and
proves that:

- `messages`, `status`, and `error` are read from `ThreadRuntime` snapshots.
- `sendMessage` streams into the canonical tree.
- `setMessages` reconciles the selected path and moves the runtime cursor.
- Cursor changes trigger `useChat` rerenders.
- A hidden branch continues streaming after another branch becomes selected.
- The visible `useChat.messages` remains the root-to-cursor projection.

The additional tree API still needs a `ThreadRuntime` subscription because
`useChat` only returns its fixed `UseChatHelpers` surface.

## Why one tree-backed AbstractChat is insufficient

AI SDK's `AbstractChat` owns one mutable `activeResponse`, one status/error
pair, one abort target, and one linear message state. The negative spike starts
two requests on one normal `Chat` and observes:

- The second request receives `[user-a, user-b]`, not a sibling path.
- `stop()` aborts only the latest active response.
- The first assistant is appended after both user messages.

Replacing its `ChatState` with a tree-aware state could redirect mutations, but
it would not make the request lifecycle concurrent. Per-run `AbstractChat`
engines remain the correct ownership boundary.

## Callback ownership

When `useChat` creates its own `Chat`, it wraps callbacks in refs so rerenders
use the latest callback functions. When the `chat` option is supplied, those
callback refs are empty and hook-level callbacks are not accepted.

Therefore:

- `ThreadRuntime` should continue owning `onData`, `onToolCall`, `onFinish`,
  `onError`, and `sendAutomaticallyWhen`.
- `useThread` should continue updating those callback references on rerender.
- `ThreadChatFacade` should delegate operations and subscriptions only.
- No callback wrapping inside `useChat` is available or needed for the facade.

## Options

### 1. Keep the current direct useThread subscriptions

`useThread` subscribes to `ThreadRuntime` itself and returns a compatible
object. This has the smallest dependency on `@ai-sdk/react` internals and
already works.

### 2. Implement useThread with a Chat facade

`useThread` creates a stable `ThreadChatFacade`, calls `useChat({ chat: facade
})` for the standard active-path API, subscribes separately for tree state, and
returns `{ ...chat, tree }`.

This mechanically delegates the standard React contract to AI SDK and makes
the compatibility claim easier to audit. It does not simplify tree or run
ownership.

### 3. Export the facade for callers to pass to useChat

This works, but `useChat` does not return tree helpers. Callers would need to
retain the external object and use a second API for tree state. That is less
ergonomic than `useThread` and exposes more lifecycle responsibility.

### 4. Cast an AbstractChat or arbitrary object to Chat

Do not use this option. It bypasses the public type and depends directly on the
three tilde-prefixed subscription methods.

## Recommendation

Keep `ThreadRuntime` and its per-run `AbstractChat` engines unchanged.

A `ThreadChatFacade` is viable as an internal implementation detail of
`useThread`, but adopting it is a compatibility-maintenance tradeoff rather
than an architectural simplification:

- Benefit: standard helpers, resume behavior, and active-path subscriptions
  are wired by the real `useChat` hook.
- Cost: the package becomes coupled to `Chat`'s tilde-prefixed React
  subscription protocol and must preserve message throttling in the facade.

Before changing production code, add differential tests for `resume`, callback
refresh, throttled message subscriptions, external facade replacement, tools,
and approvals. The spike proves feasibility, not yet superiority over the
current hook implementation.
