# Chat Runtime

`@/lib/chat-runtime` owns multi-chat runtime lifetime.

It keeps one long-lived runtime entry per chat id. Each entry owns a chat store
instance, and that same store can be provided to background controllers and the
visible chat tree.

Consumers should import from `@/lib/chat-runtime`, not from individual files.

## Mental Model

A runtime is:

- a `chatId`
- a stable `runtimeId`
- an optional `projectId`
- a per-chat store instance

The registry owns runtime entries. The app creates runtimes through provider
initial state, event handlers, or committed effects. `MountedChatRuntimes`
renders one background slot per registered runtime, providing that runtime's
store and mounted runtime context to its children.

```txt
ChatRuntimeRegistryProvider
  owns runtime entries

MountedChatRuntimes
  runtime(chat A)
    CustomStoreProvider(store A)
      MountedChatRuntimeContext(runtime A)
        children

  runtime(chat B)
    CustomStoreProvider(store B)
      MountedChatRuntimeContext(runtime B)
        children
```

The package does not define what the children do. They can mount streaming,
sync, persistence, or app-specific controllers, but those responsibilities stay
outside this package.

## Lifecycle

Create initial runtimes when the provider mounts:

```tsx
<ChatRuntimeRegistryProvider
  initialRuntimes={[
    {
      chatId,
      initialMessages,
      projectId,
    },
  ]}
>
  <App />
</ChatRuntimeRegistryProvider>
```

Create or reuse a runtime after mount from an event handler or committed effect:

```ts
const { createRuntimeIfMissing } = useChatRuntimeActions();

const runtime = createRuntimeIfMissing({
  chatId,
  initialMessages,
  projectId,
});
```

Render code should use `useChatRuntime(chatId)` for reads. It should not create
runtimes.

Render background runtime slots once near the chat root:

```tsx
<ChatRuntimeRegistryProvider initialRuntimes={initialRuntimes}>
  <MountedChatRuntimes>
    <RuntimeController />
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

Renders children once for each registered runtime.

Each child render is wrapped in:

- `CustomStoreProvider` with that runtime's store
- mounted runtime context for `useMountedChatRuntime`

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
  projectId: string | null;
  runtimeId: ChatRuntimeId;
  store: CustomChatStoreApi<ChatMessage>;
}

interface CreateRuntimeInput {
  chatId: string;
  initialMessages?: ChatMessage[];
  projectId: string | null;
}
```

## Non-Goals

This package does not own:

- routing
- chat persistence or confirmation state
- query loading or cache invalidation
- streaming transport
- chat UI
- chat actions such as send, stop, vote, or retry
- app-specific store slices
