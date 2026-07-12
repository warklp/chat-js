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

Technically yes, with a concrete `Chat` facade over `ThreadRuntime`. Do not use
that facade as the production implementation of `useThread`.

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
`AbstractChat` is still required for every concurrent assistant response. In
practice, the facade only replaces a small amount of React subscription glue
while adding inheritance and coupling to React Chat internals.

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

## Real application validation

The package's production `useThread` was temporarily changed to use the facade
and exercised through the ChatJS application with its normal HTTP transport,
persistence callbacks, query invalidation, Zustand selectors, message editing,
and sibling controls.

The following scenarios passed:

- A new provisional chat streamed, persisted, promoted to its permanent URL,
  and restored correctly.
- Additional messages streamed into an existing persisted chat.
- Editing a user message created a `2/2` branch without replacing the original.
- Switching to the previous branch while the edited response was streaming did
  not abort or redirect the hidden run.
- Switching back after completion revealed the complete hidden response.
- Stopping during submission returned the selected path to `ready`.

No browser errors, duplicate messages, reversed messages, or branch-count
inflation were observed.

React-level tests also proved that callback updates reach the existing runtime,
multiple runtime notifications are batched into one render, and externally
owned runtimes can be replaced even when they share a chat ID.

The app still required its existing runtime-to-Zustand synchronization for
legacy selectors and persistence integration. The facade neither removed nor
simplified that synchronization.

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

This mechanically delegates the standard React contract to AI SDK. It does not
simplify tree or run ownership, callback ownership, or application state
integration.

### 3. Export the facade for callers to pass to useChat

This works, but `useChat` does not return tree helpers. Callers would need to
retain the external object and use a second API for tree state. That is less
ergonomic than `useThread` and exposes more lifecycle responsibility.

### 4. Cast an AbstractChat or arbitrary object to Chat

Do not use this option. It bypasses the public type and depends directly on the
three tilde-prefixed subscription methods.

## Architectural assessment

The facade is an adapter, not another state store: its getters read
`ThreadRuntime` directly and it does not duplicate messages. It therefore does
not create a state synchronization bridge by itself.

It is still a shallow module:

- It subclasses `Chat` but bypasses the inherited `ReactChatState` and request
  engine.
- It overrides every operation returned by `useChat`.
- It depends on the tilde-prefixed React subscription protocol.
- It allocates the base `Chat` state even though that state is never used.
- It still needs a separate runtime subscription for `tree`.
- It leaves callback refresh in `ThreadRuntime` because external `useChat`
  callbacks are unavailable.
- It does not remove the app's runtime-to-Zustand integration.

Under the deletion test, removing the facade restores a small amount of direct
`useSyncExternalStore` code. Its complexity does not reappear across callers;
it remains local to `useThread`. The adapter therefore provides little module
depth or leverage.

## Recommendation

Keep the current direct `useThread` implementation and the per-run
`AbstractChat` engines.

Compatibility should be guaranteed at the public interface and by
differential tests against `UseChatHelpers`, not by routing the implementation
through the `useChat` hook. The direct implementation uses stable public React
primitives, avoids pretending to use `Chat` state that it actually bypasses,
and keeps the canonical runtime as the only state owner.

The facade spike should remain as evidence that `useChat({ chat })` is
technically interoperable and as a regression oracle if AI SDK later publishes
a proper external chat interface. It should not be exported or used in the
production hook today.
