# Chat Runtime

`@/lib/chat-runtime` owns multi-runtime lifetime.

It keeps one long-lived runtime entry per opaque `runtimeId` and renders one
mounted slot per entry. The package is intentionally ID-only: stores,
streaming, routing, project context, persistence, and UI are app-level concerns.

Consumers should import from `@/lib/chat-runtime`, not from individual files.

## Mental Model

A runtime is just a stable `runtimeId`.

The registry owns runtime entries. The app creates runtimes through provider
initial state, event handlers, or committed effects. `MountedChatRuntimes`
renders one background slot per registered runtime and provides mounted runtime
context to its children.

```txt
ChatRuntimeRegistryProvider
  owns runtime IDs

MountedChatRuntimes
  runtime(runtime A)
    MountedChatRuntimeContext(runtime A)
      children

  runtime(runtime B)
    MountedChatRuntimeContext(runtime B)
      children
```

The package does not define what the children do. In this app the mounted child
is an app runtime slot that provides the app chat store, mounts `ChatSync`, and
runs app-specific confirmation effects.

## Runtime IDs

Runtime ids are opaque to the package. The app decides how to construct and
parse them.

In this app, chat/thread runtime ids are built with app-level helpers:

```ts
const runtimeId = createMainChatRuntimeId(chatId);
```

The app store registry parses that id back into `{ chatId, threadId }` when it
needs app-specific state. That keeps the reusable runtime package independent
from chats, threads, projects, and persistence.

## Lifecycle

Create initial runtimes when the provider mounts:

```tsx
<ChatRuntimeRegistryProvider initialRuntimes={[{ runtimeId }]}>
  <App />
</ChatRuntimeRegistryProvider>
```

Create or reuse a runtime after mount from an event handler or committed effect:

```ts
const { createRuntimeIfMissing } = useChatRuntimeActions();

const runtime = createRuntimeIfMissing({ runtimeId });
```

Render code should use `useChatRuntime(runtimeId)` for reads. It should not
create runtimes.

Render background runtime slots once near the chat root:

```tsx
<ChatRuntimeRegistryProvider initialRuntimes={initialRuntimes}>
  <MountedChatRuntimes>
    {(runtime) => <AppRuntimeSlot runtime={runtime} />}
  </MountedChatRuntimes>
  <AppRoutes />
</ChatRuntimeRegistryProvider>
```

Read the runtime for a mounted background slot:

```ts
const runtime = useMountedChatRuntime();
```

Read a runtime by id:

```ts
const runtime = useChatRuntime(runtimeId);
```

## Public API

### `ChatRuntimeRegistryProvider`

Top-level provider for runtime registry state.

Mount it above code that calls runtime hooks. It accepts optional
`initialRuntimes`, used once to seed runtime entries during provider
initialization.

### `MountedChatRuntimes`

Calls its render function once for each registered runtime.

Each slot render is wrapped in mounted runtime context for
`useMountedChatRuntime`.

### `useMountedChatRuntime()`

Returns the `ChatRuntimeEntry` for the current `MountedChatRuntimes` slot.

Use this inside components rendered by `MountedChatRuntimes`.

### `useChatRuntimeActions()`

Returns the mutating runtime lifecycle API:

```ts
interface ChatRuntimeActions {
  createRuntimeIfMissing(input: CreateRuntimeInput): ChatRuntimeEntry;
}
```

Call this from event handlers or committed effects, not from render.

### `useChatRuntime(runtimeId)`

Returns the runtime entry for a runtime id, or `null` when there is no runtime.

### `useChatRuntimeRegistry()`

Low-level registry context.

```ts
interface ChatRuntimeRegistryContextValue {
  createRuntimeIfMissing(input: CreateRuntimeInput): ChatRuntimeEntry;
  entries: ChatRuntimeEntry[];
  getRuntimeById(runtimeId: string | null | undefined): ChatRuntimeEntry | null;
}
```

Prefer `useChatRuntimeActions` and `useChatRuntime` from feature code.

## Types

```ts
type RuntimeId = string;

interface ChatRuntimeEntry {
  runtimeId: RuntimeId;
}

interface CreateRuntimeInput {
  runtimeId: RuntimeId;
}
```

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
