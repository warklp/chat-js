# Chat Runtime

`@/lib/chat-runtime` owns multi-runtime lifetime.

It keeps one long-lived runtime per opaque `runtimeId` and renders one mounted
slot per runtime. Each runtime can carry generic app-owned `data`. Stores,
streaming, routing, project context, persistence, and UI are app-level concerns.

Consumers should import from `@/lib/chat-runtime`, not from individual files.

## Mental Model

A runtime is a stable non-empty `runtimeId` plus typed app-owned data.

The registry owns the active runtime list. The app creates runtimes through
provider initial state, event handlers, or committed effects.
`MountedChatRuntimes` renders one background slot per registered runtime and
passes that typed runtime to the slot renderer.

```txt
ChatRuntimeRegistryProvider
  owns runtimes

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
<ChatRuntimeRegistryProvider initialRuntimes={[{ runtimeId, data }]}>
  <App />
</ChatRuntimeRegistryProvider>
```

Create or reuse a runtime after mount from an event handler or committed effect:

```ts
const { ensureRuntime } = useChatRuntimeActions();

ensureRuntime({ runtimeId, data });
```

Render code should use `useChatRuntime(runtimeId)` for reads. It should not
create runtimes.

Render background runtime slots once near the app root:

```tsx
<ChatRuntimeRegistryProvider initialRuntimes={initialRuntimes}>
  <MountedChatRuntimes<RuntimeData>>
    {(runtime) => <RuntimeSlot runtime={runtime} />}
  </MountedChatRuntimes>
  <AppRoutes />
</ChatRuntimeRegistryProvider>
```

Read a runtime by id:

```ts
const runtime = useChatRuntime<RuntimeData>(runtimeId);
```

## Public API

### `ChatRuntimeRegistryProvider`

Top-level provider for runtime registry state.

Mount it above code that calls runtime hooks. It accepts optional
`initialRuntimes`, used once to seed runtimes during provider
initialization.

### `MountedChatRuntimes`

Calls its render function once for each registered runtime.

### `useChatRuntimeActions()`

Returns the mutating runtime lifecycle API:

```ts
interface ChatRuntimeActions<TData> {
  ensureRuntime(input: CreateRuntimeInput<TData>): ChatRuntime<TData>;
}
```

Call this from event handlers or committed effects, not from render.

### `useChatRuntime(runtimeId)`

Returns the typed runtime when it is registered, or `null` when there is no
runtime.

## Types

```ts
type RuntimeId = string;

interface ChatRuntime<TData = unknown> {
  runtimeId: RuntimeId;
  data: TData;
}

interface CreateRuntimeInput<TData = unknown> {
  runtimeId: RuntimeId;
  data: TData;
}
```

## This App's Integration

This app builds chat/thread runtime ids outside the package:

```ts
const runtimeId = createMainChatRuntimeId(chatId);
```

It stores app-owned bootstrap policy as typed runtime data:

```ts
type AppRuntimeData = {
  bootstrap: boolean;
};

const runtime = createAppRuntimeInput({
  bootstrap: false,
  runtimeId,
});
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
