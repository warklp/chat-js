# Chat Runtime

`@/lib/chat-runtime` is the package boundary for the multi-chat runtime layer.
It keeps one long-lived runtime per chat id so a chat can keep streaming after
the visible route changes.

Consumers should import from `@/lib/chat-runtime`, not from individual files.

## Mental Model

A runtime is a mounted controller plus a per-chat store instance.

```txt
ChatRuntimeRegistryProvider
  owns runtime entries
  creates/keeps store instances by chat id

MountedChatRuntimes
  mounts one controller tree per runtime
  keeps ChatSync alive for background streaming

Visible chat route
  looks up the runtime for the current route
  renders ChatSystem with the same store instance
```

The store owns chat state. The runtime owns the lifetime of the store instance.
The visible chat tree and background runtime tree both read/write the same
store through `CustomStoreProvider`.

## How It Works With `useChat`

`useChat` is still the streaming engine. The runtime layer does not replace it.
It changes where `useChat` is mounted.

Before the multi-runtime model, the active route owned the mounted `useChat`
instance. Navigating away unmounted that instance, which meant the stream was
tied to the visible page.

Now `useChat` is mounted inside `ChatSync`, and `ChatSync` is mounted by
`MountedChatRuntimes`:

```txt
MountedChatRuntimes
  MountedChatRuntime(chat A)
    CustomStoreProvider(store A)
      ChatSync
        useChat({ id: chat A })

  MountedChatRuntime(chat B)
    CustomStoreProvider(store B)
      ChatSync
        useChat({ id: chat B })
```

That gives each chat id its own live `useChat` instance. Multiple chats can
stream at the same time because their `ChatSync` components stay mounted even
when their chats are not the visible route.

The visible chat route does not call `useChat` directly. It looks up the runtime
for the current chat id and renders `ChatSystem` under the same store instance:

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
`sendMessage`, `stop`, or message tree operations should resolve through the
current chat store. They should not be methods on the runtime API. The runtime
API is for lifecycle coordination: creating, confirming, looking up, and
submitting provisional runtimes.

This also means `useChat` lifecycle is per runtime, not per route render:

- one `useChat` per mounted runtime/chat id
- one store instance per runtime/chat id
- visible routes attach to existing runtimes when available
- navigating away does not stop a runtime stream
- navigating back renders the current state from the same store

## Runtime Entry

Each runtime entry contains:

- `chatId`: the app chat id.
- `runtimeId`: stable runtime key, currently `chat:${chatId}`.
- `store`: the per-chat Zustand store instance.
- `persistenceStatus`: `"provisional"` before backend confirmation,
  `"confirmed"` after confirmation.
- `projectId`: project context, if any.
- `pendingSubmission`: first user message waiting for `ChatSync` to send.
- `submittedMessage`: user message used for follow-up parallel requests.
- `requestSpecs`: parallel request specs to run after confirmation.

## Lifecycle

### Provisional chat

Home/project-home pages create a provisional runtime using a generated draft
chat id:

```ts
runtimeApi.ensureProvisionalRuntime({
  chatId,
  projectId,
});
```

When the user submits, the route does not create a new runtime. It attaches a
pending submission to the existing provisional runtime:

```ts
runtimeApi.submitProvisionalRuntime({
  chatId,
  pendingSubmission,
  projectId,
  requestSpecs,
});
```

`MountedChatRuntimes` already has that runtime mounted. `ChatSync` observes the
pending submission, sends it, and clears the pending marker after send starts.

### Confirmation

The backend stream emits a chat-confirmed data part. `ChatSync` reports that to
the runtime registry, which flips the runtime to `"confirmed"`.

After confirmation, `RuntimeConfirmationController` invalidates persisted chat
queries and runs any secondary parallel request specs.

### Persisted chat route

Persisted `/chat/:id` and `/project/:projectId/chat/:id` routes load chat data
from the backend only when no live runtime already exists for that chat id.

Once data is available, the route creates a confirmed runtime:

```ts
runtimeApi.ensureConfirmedRuntime({
  chatId,
  initialMessages,
  projectId,
});
```

If a live runtime already exists, the route renders directly from that runtime
store instead of refetching/replacing the in-flight state.

## Public API

### `ChatRuntimeRegistryProvider`

Top-level provider for the runtime registry.

Mount this near the chat app root, above any route that needs runtime access.

### `MountedChatRuntimes`

Mounts the background runtime controller tree for every registered runtime.

There should be one instance of this component outside the visible route tree.
It is what lets multiple chats stream at the same time.

### `useChatRuntimeApi()`

App-facing lifecycle API.

```ts
const runtimeApi = useChatRuntimeApi();
```

Exports:

- `ensureConfirmedRuntime(input)`: returns an existing runtime for `chatId`, or
  creates a confirmed runtime seeded with `initialMessages`.
- `ensureProvisionalRuntime(input)`: returns an existing runtime for `chatId`,
  or creates a provisional runtime with an empty store.
- `submitProvisionalRuntime(input)`: attaches the first pending submission to
  an existing provisional runtime. Returns `false` if the runtime does not exist
  or is already confirmed.

This API intentionally does not expose chat actions like `sendMessage`. Actions
should resolve through the current chat store.

### `useChatRuntime(chatId)`

Returns the runtime entry for a chat id, or `null`.

Use this in route coordination code. Most chat UI should not need it; it should
consume the current store through store hooks.

### `useIsChatPersisted(chatId)`

Returns `false` only when a known runtime is still provisional.

This is used to disable persisted-only queries/actions, such as votes, until the
backend has confirmed the chat.

### Low-Level Registry API

`useChatRuntimeRegistry()` exposes the full registry context:

- `entries`
- `getRuntimeByChatId`
- `ensureConfirmedRuntime`
- `ensureProvisionalRuntime`
- `submitProvisionalRuntime`
- `markRuntimeConfirmed`
- `markPendingSubmissionStarted`

Prefer `useChatRuntimeApi()` unless you are implementing runtime internals.

## What Belongs Here

This package owns:

- one runtime per chat id
- runtime registry/provider state
- provisional/confirmed runtime lifecycle
- pending submission handoff to the runtime controller
- mounted background runtime controllers
- store instance lifetime for background and visible chat trees

## What Does Not Belong Here

This package should not own:

- route parsing or redirect policy
- backend query loading policy
- concrete chat UI
- app-specific store slices such as data stream, artifacts, votes, or threads
- app-specific tRPC cache keys
- the exact transport implementation

Some of those dependencies still exist today, especially `ChatSync`, tRPC query
invalidation, and `CustomChatStore`. Treat those as current integration points,
not the final reusable package boundary.

## Provider Shape

Expected app shell shape:

```tsx
<ChatRuntimeRegistryProvider>
  <AppRoutes />
  <MountedChatRuntimes />
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
  <RuntimeConfirmationController runtime={runtime} />
  <ChatSync id={runtime.chatId} />
</CustomStoreProvider>
```

The important invariant is that visible UI and background controller use the
same store instance for the same `chatId`.

## Reuse Direction

To make this package reusable outside this app, the next boundary cleanup should
be to inject app-specific dependencies:

- store factory, instead of directly calling `createCustomChatStore`
- runtime controller component, instead of directly mounting `ChatSync`
- confirmation side effects, instead of hardcoding tRPC invalidation
- parallel request continuation behavior, instead of importing app helpers

That would leave this package as a generic runtime registry over a store that
satisfies the base chat-store contract.
