# Chat Runtime

`@/lib/chat-runtime` owns multi-chat runtime lifetime.

It keeps one long-lived runtime entry per chat id and renders one mounted slot
per entry. The package is intentionally ID-only: stores, streaming, project
context, persistence, and UI are app-level concerns.

Consumers should import from `@/lib/chat-runtime`, not from individual files.

## Mental Model

A runtime is:

- a `chatId`
- a stable `runtimeId`

The registry owns runtime entries. The app creates runtimes through provider
initial state, event handlers, or committed effects. `MountedChatRuntimes`
renders one background slot per registered runtime and provides mounted runtime
context to its children.

```txt
ChatRuntimeRegistryProvider
  owns runtime IDs

MountedChatRuntimes
  runtime(chat A)
    MountedChatRuntimeContext(runtime A)
      children

  runtime(chat B)
    MountedChatRuntimeContext(runtime B)
      children
```

The package does not define what the children do. In this app the mounted child
is an app runtime slot that provides the app chat store, mounts `ChatSync`, and
runs app-specific confirmation effects.

## Lifecycle

Create initial runtimes when the provider mounts:

```tsx
<ChatRuntimeRegistryProvider initialRuntimes={[{ chatId }]}>
  <App />
</ChatRuntimeRegistryProvider>
```

Create or reuse a runtime after mount from an event handler or committed effect:

```ts
const { createRuntimeIfMissing } = useChatRuntimeActions();

const runtime = createRuntimeIfMissing({ chatId });
```

Render code should use `useChatRuntime(chatId)` for reads. It should not create
runtimes.

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

Read a runtime by chat id:

```ts
const runtime = useChatRuntime(chatId);
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

### `useChatRuntime(chatId)`

Returns the runtime entry for a chat id, or `null` when there is no runtime.

### `useChatRuntimeRegistry()`

Low-level registry context.

```ts
interface ChatRuntimeRegistryContextValue {
  createRuntimeIfMissing(input: CreateRuntimeInput): ChatRuntimeEntry;
  entries: ChatRuntimeEntry[];
  getRuntimeByChatId(chatId: string | null | undefined): ChatRuntimeEntry | null;
}
```

Prefer `useChatRuntimeActions` and `useChatRuntime` from feature code.

## Types

```ts
type ChatRuntimeId = `chat:${string}`;

interface ChatRuntimeEntry {
  chatId: string;
  runtimeId: ChatRuntimeId;
}

interface CreateRuntimeInput {
  chatId: string;
}
```

## Non-Goals

This package does not own:

- routing
- project context
- chat store creation or store providers
- chat persistence or confirmation state
- query loading or cache invalidation
- streaming transport
- chat UI
- chat actions such as send, stop, vote, or retry
- app-specific store slices
