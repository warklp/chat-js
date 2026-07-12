# `useThread` React Implementation Comparison

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

This branch deliberately implements the facade alternative so its code,
behavior, and dependency profile can be reviewed rather than inferred. The
recommended branch keeps the direct React projection.

## Executive comparison

| Axis | Direct runtime subscription | `useChat({ chat: facade })` |
| --- | --- | --- |
| Consumer `UseChatHelpers` compatibility | Yes | Yes |
| Canonical tree ownership | `ThreadRuntime` | `ThreadRuntime` |
| Concurrent branch requests | Per-run `AbstractChat` | Per-run `AbstractChat` |
| AI SDK stream/request reuse | Complete | Complete |
| React subscription reuse | Reimplemented with public React primitives | Delegated to `useChat` |
| Tree subscription | Direct runtime subscription | Separate direct runtime subscription |
| Callback freshness | Runtime-owned | Runtime-owned |
| Transport freshness | Runtime-owned | Runtime-owned |
| External `useChat` hook options | N/A | Ignored except `resume` and throttle |
| Dependency on concrete React `Chat` | No | Yes |
| Dependency on tilde subscription methods | No | Yes |
| Dead inherited linear state/request engine | No | Yes |
| Same-ID runtime replacement | Explicitly subscribed by runtime identity | Relies on interactions between `useChat` subscriptions |
| Canonical Zustand store extensibility | Natural runtime store seam | Facade provides no store seam |
| Likely AI SDK patch/minor churn | Low | Low to medium |
| Likely AI SDK major migration work | Public helper/type diff | Helper/type plus concrete `Chat` protocol diff |
| Module depth | Runtime hides the hard behavior | Facade is a shallow adapter over the same runtime |

The facade wins only on the amount of handwritten React hook glue. The direct
implementation wins on ownership clarity, dependency surface, and future
store extensibility. Both implementations reuse the same high-complexity AI
SDK behavior.

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

## Next major: React 4 and AI 7

The next stable major was inspected and tested:

- `@ai-sdk/react@4.0.15`
- `ai@7.0.14`

The unchanged thread package passes its type check and all 22 runtime,
integration, facade, and React behavior tests against those versions.

The direction of the new major is conservative for chat:

- `UseChatHelpers`, `UseChatOptions`, the concrete `Chat` requirement, and the
  three tilde-prefixed subscriptions are unchanged.
- `ReactChatState` is unchanged.
- `AbstractChat`, `ChatState`, statuses, request methods, tools, approvals, and
  the single `activeResponse` model are behaviorally unchanged.
- The React package added unrelated realtime and MCP app surfaces rather than
  generalizing `Chat` into a public external-store interface.

The meaningful `useChat` change is transport freshness. For a hook-owned chat,
React 4 keeps the latest `transport` in a ref and gives `Chat` a stable proxy
transport. This fixes stale transports without recreating the chat.

That improvement does not apply to `useChat({ chat })`: when an external chat
is supplied, hook callbacks and transport are ignored and the external object
continues to own them. A thread facade would therefore need to implement
transport replacement itself, just like the direct runtime.

This major supports the current ownership split. The frequently changing
stream and request behavior remains in `AbstractChat`, which the thread runtime
already uses once per active run. Routing the React projection through
`useChat` would not increase reuse of that behavior.

## Responsibility comparison

There are two separate layers to compare.

### AI request engine

Both alternatives reuse the same AI SDK responsibilities through one
`AbstractChat` per run:

- transport invocation and reconnection
- stream chunk processing and message accumulation
- status transitions and request errors
- abort controllers
- data and tool callbacks
- tool outputs and approvals
- automatic tool follow-ups
- finish callbacks and finish reasons
- message metadata and data schemas

Both alternatives also require the same thread-specific responsibilities:

- canonical nodes and edges
- cursor and selected-path projection
- run registry and concurrency policy
- stable assistant identity
- tool and approval ownership routing
- branch-aware regeneration, stopping, and resume
- mapping a new user message onto a selected parent

The facade does not reduce any of this because its `sendMessage`, `regenerate`,
`stop`, tools, and approvals must delegate to `ThreadRuntime`. Letting one
inherited `Chat` own these methods would restore the single `activeResponse`
limitation and break concurrent branches.

### React useChat glue

The direct hook owns more of the small React layer:

| Responsibility | Direct useThread | useChat facade |
| --- | --- | --- |
| Create or replace runtime by identity | Thread hook | Thread hook |
| Keep callbacks fresh | Thread runtime | Thread runtime |
| Keep transport fresh | Thread runtime | Thread runtime |
| Subscribe to selected messages | Thread hook | useChat + adapter |
| Subscribe to status and error | Thread hook | useChat + adapter |
| Throttle message notifications | Thread hook | Adapter honoring useChat's wait value |
| Apply setMessages updater | Thread hook | useChat |
| Run resume-on-mount effect | Thread hook | useChat |
| Assemble standard helper object | Thread hook | useChat |
| Subscribe to complete tree | Thread hook | Thread hook |

The facade reuses `useSyncExternalStore` wiring, the `setMessages` updater, the
resume effect, and helper-object assembly. It must still provide the
subscription implementation and throttling because `useChat` delegates those
to the external `Chat` object.

Therefore the direct alternative reimplements more of `useChat` numerically,
but the difference is thin, stable React glue. Both alternatives reuse the
same high-complexity and higher-change AI SDK request engine.

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

## Transport and option ownership

The `chat` option selects externally owned chat mode. In this mode, `useChat`
does not apply hook-level `transport`, `onData`, `onToolCall`, `onFinish`,
`onError`, or `sendAutomaticallyWhen` options to the supplied object.

The facade branch therefore keeps `ThreadRuntime.updateOptions` and delegates
callbacks and transport to the runtime exactly like the direct branch. A
transport update affects future per-run engines; an already active run keeps
the transport and abort controller with which it started.

`useChat` still owns two useful hook concerns for the facade:

- `experimental_throttle` is passed to the facade's message subscription.
- `resume` invokes the facade's delegated `resumeStream` on mount.

This is less reuse than the call site initially suggests. Supplying `chat` is
instance injection, not option injection.

## External store and Zustand extensibility

Passing a Zustand store as the `chat` option is not supported. The public type
requires a concrete React `Chat`, and `useChat` calls its three React-specific
subscription methods. A Zustand integration would therefore require this
stack:

```text
useChat
  -> concrete Chat facade
     -> Zustand-backed ChatState or ThreadRuntime
```

That does not remove the facade and does not solve thread concurrency. A
single inherited `Chat` still owns one `activeResponse`; the package still
needs one isolated `AbstractChat` per active branch.

The stronger store seam sits below `ThreadRuntime`:

```text
useThread
  -> ThreadRuntime
     -> ThreadStore (memory adapter or Zustand adapter)
     -> per-run AbstractChat engines
```

Observable canonical state belongs in that store: messages, edges, roots,
cursor, serializable run descriptors, statuses, and errors. Ephemeral request
objects remain runtime-owned: `AbstractChat` instances, abort controllers,
promises, transports, and tool ownership indexes.

The direct React implementation can subscribe to any runtime store satisfying
that interface. The facade adds another subscription layer but no additional
extensibility. It also cannot remove the ChatJS app's current runtime-to-
Zustand synchronization because existing selectors still read the app store.

## React lifecycle and identity

`useChat` replaces its internal `chatRef` when the supplied object changes, but
its message subscription callback is keyed by throttle and `chat.id`. Replacing
an external facade with another facade that has the same ID does not directly
force that message subscription to be recreated. Status and error
subscriptions do receive the new facade methods, and React checks snapshots
around commits, so the tested replacement scenario works today.

That behavior is nevertheless indirect. The direct implementation keys its
subscription on the actual `ThreadRuntime` object and has an explicit test for
same-ID replacement. A production facade would need to keep this scenario as a
regression test for every supported `@ai-sdk/react` version.

The facade must also be created during render so `useChat` receives the current
instance. Moving runtime subscription rewiring into render would be a bad
React pattern; this branch avoids that by making each facade immutable and
delegating subscriptions directly to its runtime.

## Performance and allocation profile

Both implementations clone canonical message snapshots and notify React from
the same runtime. Neither changes stream reduction cost.

The facade adds:

- one concrete `Chat` and its unused `ReactChatState`
- inherited callback sets and linear message allocation
- facade methods and three runtime subscription adapters
- a second runtime subscription for tree-only state

The direct implementation adds only the hook's `useSyncExternalStore`
subscriptions. The difference is unlikely to dominate token streaming, but it
favors the direct implementation and makes the facade harder to explain.

## Testability

Both alternatives can be tested through the same public `UseThreadHelpers`
interface and runtime integration suite. The facade needs extra tests for:

- concrete `Chat` type compatibility
- the three tilde-prefixed subscription methods
- message throttling delegated by `useChat`
- same-ID external runtime replacement
- callback and transport ownership in external-chat mode
- `useChat` behavior across every supported React package major

The direct implementation needs focused tests for its small subscription,
updater, throttle, and resume glue. Its request and tree behavior remains
covered at the runtime seam in both alternatives.

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
