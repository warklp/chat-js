# Chat Runtime

`@/lib/chat-runtime` is the package boundary for multi-chat runtime lifetime.
It keeps one mounted runtime per chat id so streams can keep running after the
visible route changes.

Consumers should import from `@/lib/chat-runtime`, not from individual files.

## Mental Model

A runtime is a chat id plus a long-lived store instance.

```txt
ChatRuntimeRegistryProvider
  owns runtime entries
  creates/keeps store instances by chat id

MountedChatRuntimes
  renders one background controller slot per runtime

Visible chat route
  looks up the runtime for the current route
  renders ChatSystem with the same store instance
```

The store owns chat state. The runtime owns the lifetime of the store instance.
The visible chat tree and background controller both read/write the same store
through `CustomStoreProvider`.

## How It Works With `useChat`

`useChat` is still the streaming engine. The runtime layer does not replace it.
It changes where `useChat` is mounted.

Before the multi-runtime model, the active route owned the mounted `useChat`
instance. Navigating away unmounted that instance, which tied the stream to the
visible page.

Now the app mounts `useChat` inside `ChatSync`, and `ChatSync` is rendered in a
background runtime slot:

```txt
MountedChatRuntimes
  runtime(chat A)
    CustomStoreProvider(store A)
      MountedChatRuntimeContext(runtime A)
        ChatSync
          useChat({ id: chat A })

  runtime(chat B)
    CustomStoreProvider(store B)
      MountedChatRuntimeContext(runtime B)
        ChatSync
          useChat({ id: chat B })
```

That gives each chat id its own live `useChat` instance. Multiple chats can
stream at the same time because their runtime slots stay mounted even when
their chats are not the visible route.

The visible route does not call `useChat` directly. It looks up the runtime for
the current chat id and renders `ChatSystem` under the same store instance:

```txt
Visible route for chat A
  CustomStoreProvider(store A)
    ChatSystem
```

So the background controller and visible UI share state like this:

```txt
ChatSync/useChat writes messages/status/data stream -> store A
ChatSystem reads messages/status/data stream        <- store A
```

Actions should follow the same rule. Inside a chat tree, actions such as
`sendMessage`, `stop`, votes, data stream handling, or message tree operations
should resolve through the current chat store or app hooks. They should not be
methods on the runtime API.

## Persistence Is App-Level

The runtime package does not know whether a chat is persisted.

Persistence depends on app semantics: this app treats the backend
`data-chatConfirmed` stream part as the point where a draft chat becomes safe
for persisted-only behavior such as votes and query refetches. That state lives
in the app chat store, not in the runtime registry.

Current app integration:

- `ChatSync` receives `data-chatConfirmed` and sets `isChatPersisted` in the
  current chat store.
- `ChatRuntimeController` reacts to `isChatPersisted` and runs app-specific
  follow-up effects: query invalidation and secondary parallel requests.
- route/query code reads persistence through app store hooks such as
  `useRuntimeIsChatPersisted`.
- vote/feedback code reads persistence through `useIsChatPersisted`.

This keeps the runtime package focused on mounted runtime lifetime, while the
app decides what confirmation means.

## Runtime Entry

Each runtime entry contains:

- `chatId`: the app chat id.
- `runtimeId`: stable runtime key, currently `chat:${chatId}`.
- `store`: the per-chat Zustand store instance.
- `projectId`: project context, if any.

There is intentionally no `persistenceStatus` on the runtime entry.

## Lifecycle

### Ensure Runtime

Routes declare that a runtime should exist for a chat id:

```ts
runtimeApi.ensureRuntime({
  chatId,
  initialMessages,
  projectId,
});
```

If the runtime already exists, it is returned. If not, the registry creates a
store and registers a new runtime entry.

For a new draft chat, `initialMessages` is usually omitted. For a loaded history
chat, `initialMessages` seeds the store from backend data.

### Submit Messages

Submitting a message does not go through the runtime registry. The runtime only
keeps `ChatSync/useChat` mounted; `useChat` registers `sendMessage` on the chat
store. Submit code calls that store action directly:

```ts
const sendMessage = store.getState().sendMessage;

sendMessage?.(message, options);
```

This keeps the runtime registry out of chat actions. If `sendMessage` is not
available, the runtime controller has not finished mounting yet.

### Mount Runtime Controllers

`MountedChatRuntimes` does not know about `useChat`, persistence, tRPC, or
parallel requests. It only provides the runtime store and mounted-runtime
context:

```tsx
<MountedChatRuntimes>
  <ChatRuntimeController />
</MountedChatRuntimes>
```

The app controller calls `useMountedChatRuntime()` to read the runtime for the
current mounted slot. In this app that controller mounts `ChatSync` plus
app-level confirmation side effects.

## Public API

### `ChatRuntimeRegistryProvider`

Top-level provider for the runtime registry.

Mount this near the chat app root, above any route that needs runtime access.

### `MountedChatRuntimes`

Mounts one background runtime slot for every registered runtime.

There should be one instance of this component outside the visible route tree.
It is what lets multiple chats stream at the same time.

The children are rendered once per runtime under both `CustomStoreProvider` and
the mounted-runtime context.

### `useMountedChatRuntime()`

Returns the runtime for the current `MountedChatRuntimes` slot.

Use this from runtime controller components mounted inside
`MountedChatRuntimes`.

### `useChatRuntimeApi()`

App-facing lifecycle API.

```ts
const runtimeApi = useChatRuntimeApi();
```

Exports:

- `ensureRuntime(input)`: returns an existing runtime for `chatId`, or creates a
  runtime seeded with optional `initialMessages`.

This API intentionally does not expose chat actions like `sendMessage`. Actions
resolve through the current chat store.

### `useChatRuntime(chatId)`

Returns the runtime entry for a chat id, or `null`.

Use this in route coordination code. Most chat UI should not need it; it should
consume the current store through store hooks.

### Low-Level Registry API

`useChatRuntimeRegistry()` exposes the full registry context:

- `entries`
- `getRuntimeByChatId`
- `ensureRuntime`

Prefer `useChatRuntimeApi()` unless you are implementing runtime internals or
the app-level runtime controller.

## What Belongs Here

This package owns:

- one runtime per chat id
- runtime registry/provider state
- mounted background runtime slots
- store instance lifetime for background and visible chat trees

## What Does Not Belong Here

This package should not own:

- route parsing or redirect policy
- chat persistence/confirmation state
- backend query loading policy
- concrete chat UI
- app-specific store slices such as data stream, artifacts, votes, persistence,
  or threads
- app-specific tRPC cache keys
- `ChatSync` or any exact transport implementation
- parallel request continuation behavior

## Provider Shape

Expected app shell shape:

```tsx
<ChatRuntimeRegistryProvider>
  <MountedChatRuntimes>
    <ChatRuntimeController />
  </MountedChatRuntimes>
  <AppRoutes />
</ChatRuntimeRegistryProvider>
```

Expected visible chat shape:

```tsx
<CustomStoreProvider store={runtime.store}>
  <ChatSystem />
</CustomStoreProvider>
```

Expected background runtime shape:

```tsx
<CustomStoreProvider store={runtime.store}>
  <RuntimeContext value={runtime}>
    <ChatRuntimeController />
  </RuntimeContext>
</CustomStoreProvider>
```

The important invariant is that visible UI and background controller use the
same store instance for the same `chatId`.

## Reuse Direction

To make this package easier for AI SDK React users outside this app, the next
boundary cleanup should be to inject app-specific dependencies:

- store factory, instead of directly calling `createCustomChatStore`
- store provider component, instead of directly using `CustomStoreProvider`
- optional AI SDK controller helper that mounts one `useChat` per runtime

That would leave this package as a generic runtime registry over a store that
satisfies a small base chat-store contract.
