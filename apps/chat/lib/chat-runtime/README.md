# Chat Runtime

`@/lib/chat-runtime` owns multi-runtime lifetime.

It keeps one long-lived runtime per opaque `runtimeId` and renders one mounted
slot per id. The package is intentionally ID-only: stores, streaming, routing,
project context, persistence, and UI are app-level concerns.

Consumers should import from `@/lib/chat-runtime`, not from individual files.

## Mental Model

A runtime is just a stable non-empty `runtimeId`.

The registry owns the active runtime id list. The app creates runtimes through
provider initial state, event handlers, or committed effects.
`MountedChatRuntimes` renders one background slot per registered id and passes
that id to the slot renderer.

```txt
ChatRuntimeRegistryProvider
  owns runtime ids

MountedChatRuntimes
  runtime(runtime A)
    children(runtime A)

  runtime(runtime B)
    children(runtime B)
```

The package does not define what the children do.

## Lifecycle

Seed initial runtimes when the provider mounts:

```tsx
<ChatRuntimeRegistryProvider initialRuntimeIds={[runtimeId]}>
  <App />
</ChatRuntimeRegistryProvider>
```

Create or reuse a runtime after mount from an event handler or committed effect:

```ts
const { ensureRuntime } = useChatRuntimeActions();

ensureRuntime(runtimeId);
```

Render code should use `useChatRuntime(runtimeId)` for reads. It should not
create runtimes.

Render background runtime slots once near the app root:

```tsx
<ChatRuntimeRegistryProvider initialRuntimeIds={initialRuntimeIds}>
  <MountedChatRuntimes>
    {(runtimeId) => <RuntimeSlot runtimeId={runtimeId} />}
  </MountedChatRuntimes>
  <AppRoutes />
</ChatRuntimeRegistryProvider>
```

Read a runtime by id:

```ts
const liveRuntimeId = useChatRuntime(runtimeId);
```

## Public API

### `ChatRuntimeRegistryProvider`

Top-level provider for runtime registry state.

Mount it above code that calls runtime hooks. It accepts optional
`initialRuntimeIds`, used once to seed runtime ids during provider
initialization.

### `MountedChatRuntimes`

Calls its render function once for each registered runtime id.

### `useChatRuntimeActions()`

Returns the mutating runtime lifecycle API:

```ts
interface ChatRuntimeActions {
  ensureRuntime(runtimeId: RuntimeId): RuntimeId;
}
```

Call this from event handlers or committed effects, not from render.

### `useChatRuntime(runtimeId)`

Returns the runtime id when it is registered, or `null` when there is no runtime.

## Types

```ts
type RuntimeId = string;
```

## This App's Integration

This app builds chat/thread runtime ids outside the package:

```ts
const runtimeId = createMainChatRuntimeId(chatId);
```

The app store registry parses that id back into `{ chatId, threadId }` when it
needs app-specific state. The mounted slot provides the app chat store, mounts
`ChatSync`, and runs app-specific confirmation effects.

## Non-Goals

This package does not own:

- runtime id construction or parsing
- routing
- project context
- chat/thread identity
- chat store creation or store providers
- chat persistence or confirmation state
- query loading or cache invalidation
- streaming transport
- chat UI
- chat actions such as send, stop, vote, or retry
- app-specific store slices
