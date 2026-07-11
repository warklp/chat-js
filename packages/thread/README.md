# @chatjs/thread

Headless threaded chat state for AI SDK UI messages.

## Installation

Install the versioned package when you want runtime updates through your package
manager:

```bash
bun add @chatjs/thread ai @ai-sdk/react
```

Install from the ChatJS source registry when you want the runtime copied into
your application under `@lib/thread`:

```bash
bunx shadcn@latest add FranciscoMoretti/chat-js/thread#main
```

The optional demo adds an application-owned conversation and tree UI:

```bash
bunx shadcn@latest add FranciscoMoretti/chat-js/thread-demo#main
```

`useThread` is designed as a strict superset of `useChat` for the active path:
you can render `messages`, call `sendMessage`, `regenerate`, `stop`,
`setMessages`, and handle `status`/`error` the same way you would with
`@ai-sdk/react/useChat`. The extra `tree` object exposes the full message tree.

```tsx
"use client";

import { DefaultChatTransport } from "ai";
import { useThread } from "@chatjs/thread/react";

export function Chat() {
  const chat = useThread({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        chat.sendMessage({ text: "Hello" });
      }}
    >
      {chat.messages.map((message) => (
        <div key={message.id}>{message.role}</div>
      ))}
      <button type="submit">Send</button>
    </form>
  );
}
```

Branch from any message by selecting it, then sending normally:

```ts
chat.tree.setCursor(messageId);
await chat.sendMessage({ text: "Create a branch here" });
```

Request multiple assistant responses from the same user message:

```ts
const primary = await chat.tree.startRun({
  follow: true,
  from: userMessageId,
});
const alternative = await chat.tree.startRun({
  follow: false,
  from: userMessageId,
});

await Promise.all([primary.finished, alternative.finished]);
```

`sendMessage` has the same completion contract as AI SDK: its promise resolves
after the request and automatic tool follow-ups finish. `tree.startRun` returns a
handle as soon as the request starts, which is useful for launching parallel
responses and controlling them independently.

Each run uses its reserved assistant message ID as its public identity. A
backend may keep a separate resumable stream ID in message metadata; that
transport detail does not need to enter the hook API.

The top-level state always describes the selected path. `status`, `error`,
`stop`, `clearError`, and `resumeStream` target the run selected by
`tree.cursorId`. Whole-tree state and controls live under `tree`:

```ts
chat.status; // selected path
chat.tree.status; // aggregate status
chat.tree.activeRuns;
chat.tree.runs;

await chat.tree.stopRun(runId);
await chat.tree.stopRunForMessage(assistantMessageId);
chat.tree.stopAll();
await chat.tree.resumeRun(runId);
```

Runs use the same `submitted`, `streaming`, `ready`, and `error` statuses as
`useChat`. `activeRuns` contains runs whose status is `submitted` or
`streaming`; aborting a run returns it to `ready` like AI SDK.

Tool outputs and approval responses keep the standard `useChat` signatures.
The runtime routes each response to the run that emitted its tool or approval
identifier.

For resumable HTTP streams, route reconnects by assistant message ID with AI
SDK's native transport hook. The server can load that message and resolve its
current infrastructure stream ID:

```ts
new DefaultChatTransport({
  prepareReconnectToStreamRequest({ body, id }) {
    const messageId = body?.assistantMessageId;

    return {
      api: `/api/chat/${id}/stream?messageId=${messageId}`,
    };
  },
});
```

The package does not ship UI components. Build tree renderers, sibling
switchers, branch pickers, canvases, or debug panels from the headless state:

```ts
chat.tree.cursorId;
chat.tree.messagesById;
chat.tree.parentById;
chat.tree.childrenByParentId;
chat.tree.rootIds;
chat.tree.activeRuns;
chat.tree.runs;
chat.tree.getRun(runId);
chat.tree.getRunForMessage(messageId);
chat.tree.getPath(messageId);
chat.tree.getChildren(messageId);
chat.tree.getSiblings(messageId);
```

`setMessages` reconciles only the selected path. Truncating the array moves the
cursor backward without deleting hidden descendants; a changed suffix creates
a branch. Reusing an existing message ID under a different parent throws.

Pass an externally owned runtime when the application needs the instance-level
equivalent of `useChat({ chat })`:

```ts
const runtime = createThreadRuntime({ transport });
const chat = useThread({ runtime });
```

Persist and restore the tree with snapshots:

```ts
const snapshot = chat.tree.getSnapshot();

const restored = useThread({
  initialTree: snapshot,
  transport,
});
```
