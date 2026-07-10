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
await Promise.all([
  chat.sendMessage(undefined, {
    tree: { from: userMessageId, follow: true },
  }),
  chat.sendMessage(undefined, {
    tree: { from: userMessageId, follow: false },
  }),
]);
```

The package does not ship UI components. Build tree renderers, sibling
switchers, branch pickers, canvases, or debug panels from the headless state:

```ts
chat.tree.cursorId;
chat.tree.messagesById;
chat.tree.parentById;
chat.tree.childrenByParentId;
chat.tree.rootIds;
chat.tree.activeStreams;
chat.tree.getPath(messageId);
chat.tree.getChildren(messageId);
chat.tree.getSiblings(messageId);
```

Persist and restore the tree with snapshots:

```ts
const snapshot = chat.exportTree();

const restored = useThread({
  initialTree: snapshot,
  transport,
});
```
