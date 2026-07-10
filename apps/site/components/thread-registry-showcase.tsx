"use client";

import { getMessageText, type MessageTreeSnapshot } from "@chatjs/thread";
import { type UseThreadHelpers, useThread } from "@chatjs/thread/react";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Files,
  GitBranch,
  Package,
  Send,
  Square,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

type InstallMode = "registry" | "package";
interface PlaygroundMetadata {
  activeStreamId: string | null;
  createdAt: string;
  title?: string;
}
type PlaygroundMessage = UIMessage<PlaygroundMetadata>;
type PlaygroundChat = UseThreadHelpers<PlaygroundMessage>;

interface StreamBody {
  tree?: {
    assistantMessageId?: string;
    responseLabel?: string;
    streamId?: string;
  };
}

interface LayoutNode {
  depth: number;
  id: string;
  x: number;
  y: number;
}

const INSTALL_COMMANDS: Record<InstallMode, string> = {
  registry: "bunx shadcn@latest add FranciscoMoretti/chat-js/thread#main",
  package: "bun add @chatjs/thread ai @ai-sdk/react",
};

function createMessage({
  id,
  role,
  text,
  title,
}: {
  id: string;
  role: "assistant" | "user";
  text: string;
  title: string;
}): PlaygroundMessage {
  return {
    id,
    metadata: {
      activeStreamId: null,
      createdAt: new Date().toISOString(),
      title,
    },
    parts: [{ text, type: "text" }],
    role,
  };
}

const initialMessages = [
  createMessage({
    id: "msg_01",
    role: "user",
    text: "Plan a production launch.",
    title: "Initial prompt",
  }),
  createMessage({
    id: "msg_02",
    role: "assistant",
    text: "Start with architecture, rollout, and observability as separate workstreams.",
    title: "Initial answer",
  }),
  createMessage({
    id: "msg_03",
    role: "user",
    text: "Make the plan technical.",
    title: "Follow-up",
  }),
  createMessage({
    id: "msg_04a",
    role: "assistant",
    text: "Use staged environments, immutable builds, and progressive traffic shifting.",
    title: "Deployment branch",
  }),
  createMessage({
    id: "msg_05a",
    role: "user",
    text: "Add the deployment sequence.",
    title: "Deployment follow-up",
  }),
  createMessage({
    id: "msg_04b",
    role: "assistant",
    text: "Define service-level indicators before rollout and attach alerts to user impact.",
    title: "Observability branch",
  }),
  createMessage({
    id: "msg_05b",
    role: "user",
    text: "Focus on monitoring first.",
    title: "Observability follow-up",
  }),
] satisfies PlaygroundMessage[];

const initialTree: MessageTreeSnapshot<PlaygroundMessage> = {
  childrenByParentId: {
    __root__: ["msg_01"],
    msg_01: ["msg_02"],
    msg_02: ["msg_03"],
    msg_03: ["msg_04a", "msg_04b"],
    msg_04a: ["msg_05a"],
    msg_04b: ["msg_05b"],
  },
  cursorId: "msg_05a",
  messagesById: Object.fromEntries(
    initialMessages.map((message) => [message.id, message])
  ),
  parentById: {
    msg_01: null,
    msg_02: "msg_01",
    msg_03: "msg_02",
    msg_04a: "msg_03",
    msg_04b: "msg_03",
    msg_05a: "msg_04a",
    msg_05b: "msg_04b",
  },
  rootIds: ["msg_01"],
  version: 1,
};

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

class PlaygroundTransport implements ChatTransport<PlaygroundMessage> {
  sendMessages({
    abortSignal,
    body,
    messages,
  }: Parameters<ChatTransport<PlaygroundMessage>["sendMessages"]>[0]) {
    const requestBody = body as StreamBody | undefined;
    const assistantMessageId =
      requestBody?.tree?.assistantMessageId ?? "assistant";
    const streamId =
      requestBody?.tree?.streamId ?? `stream:${assistantMessageId}`;
    const responseLabel = requestBody?.tree?.responseLabel ?? "Assistant";
    const userMessage = messages.at(-1);
    const prompt = userMessage ? getMessageText(userMessage) : "this branch";
    const response = `${responseLabel}: I am streaming independently from "${prompt}". Select another node while I run, or start more responses from the same prompt.`;
    const words = response.split(" ");

    return Promise.resolve(
      new ReadableStream<UIMessageChunk<PlaygroundMetadata>>({
        async start(controller) {
          try {
            controller.enqueue({
              messageId: assistantMessageId,
              messageMetadata: {
                activeStreamId: streamId,
                createdAt: new Date().toISOString(),
                title: responseLabel,
              },
              type: "start",
            });
            controller.enqueue({ id: "text", type: "text-start" });

            for (const [index, word] of words.entries()) {
              await delay(55, abortSignal);
              controller.enqueue({
                delta: index === 0 ? word : ` ${word}`,
                id: "text",
                type: "text-delta",
              });
            }

            controller.enqueue({ id: "text", type: "text-end" });
            controller.enqueue({
              finishReason: "stop",
              messageMetadata: {
                activeStreamId: null,
                createdAt: new Date().toISOString(),
                title: responseLabel,
              },
              type: "finish",
            });
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      })
    );
  }

  reconnectToStream() {
    return Promise.resolve(null);
  }
}

function buildTreeLayout({
  childrenByParentId,
  rootIds,
}: {
  childrenByParentId: Record<string, string[]>;
  rootIds: string[];
}) {
  const positions = new Map<string, LayoutNode>();
  let nextLeaf = 0;
  let maxDepth = 0;

  function visit(id: string, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    const children = childrenByParentId[id] ?? [];
    let column: number;

    if (children.length === 0) {
      column = nextLeaf;
      nextLeaf += 1;
    } else {
      const childColumns = children.map((childId) => visit(childId, depth + 1));
      column =
        childColumns.reduce((total, childColumn) => total + childColumn, 0) /
        childColumns.length;
    }

    positions.set(id, { depth, id, x: column * 172 + 92, y: depth * 104 + 54 });
    return column;
  }

  for (const rootId of rootIds) {
    visit(rootId, 0);
    nextLeaf += 1;
  }

  return {
    height: Math.max(420, (maxDepth + 1) * 104 + 48),
    nodes: [...positions.values()],
    positions,
    width: Math.max(430, Math.max(1, nextLeaf - 1) * 172 + 184),
  };
}

function InstallCommand() {
  const [mode, setMode] = useState<InstallMode>("registry");
  const [copied, setCopied] = useState(false);
  const command = INSTALL_COMMANDS[mode];

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-8 max-w-3xl border border-border bg-card">
      <div className="flex items-center justify-between border-border border-b px-3 py-2">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Installation method</legend>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
              mode === "registry"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("registry")}
            type="button"
          >
            <Files className="size-3.5" />
            Registry
          </button>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
              mode === "package"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("package")}
            type="button"
          >
            <Package className="size-3.5" />
            Package
          </button>
        </fieldset>
        <button
          aria-label="Copy installation command"
          className="grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          onClick={copyCommand}
          type="button"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
      <div className="overflow-x-auto px-4 py-4">
        <code className="whitespace-nowrap font-mono text-sm">
          <span className="select-none text-muted-foreground">$ </span>
          {command}
        </code>
      </div>
    </div>
  );
}

function Conversation({
  chat,
  draft,
  onBranch,
  onDraftChange,
  onResponseCountChange,
  onSend,
  responseCount,
}: {
  chat: PlaygroundChat;
  draft: string;
  onBranch: (messageId: string) => void;
  onDraftChange: (draft: string) => void;
  onResponseCountChange: (count: number) => void;
  onSend: () => void;
  responseCount: number;
}) {
  return (
    <section className="flex min-h-[43rem] min-w-0 flex-col">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-border border-b px-5 py-3">
        <div>
          <p className="font-medium text-sm">Active conversation</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            messages = tree.getPath(cursorId)
          </p>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px]">
          <span>{chat.messages.length} path nodes</span>
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-current" /> {chat.status}
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
        {chat.messages.map((message) => {
          const isUser = message.role === "user";
          const siblings = chat.tree.getSiblings(message.id);
          const siblingIndex = siblings.findIndex(
            (sibling) => sibling.id === message.id
          );
          const hasSiblings = siblings.length > 1 && siblingIndex >= 0;

          function navigateToSibling(nextIndex: number) {
            const sibling = siblings[nextIndex];
            if (!sibling) {
              return;
            }
            const leaf = chat.tree.getLeaves(sibling.id).at(-1);
            chat.tree.setCursor(leaf?.id ?? sibling.id);
          }

          return (
            <article
              className={
                isUser
                  ? "group ml-auto max-w-[82%] bg-foreground px-4 py-3 text-background"
                  : "group max-w-[90%] border-foreground/20 border-l-2 px-4 py-1"
              }
              key={message.id}
            >
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase opacity-60">
                <span>{message.role}</span>
                <span className="font-mono normal-case">{message.id}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {getMessageText(message) || "Streaming..."}
              </p>
              <div className="mt-2 flex min-h-7 items-center gap-1 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  className="inline-flex h-7 items-center gap-1.5 px-1 text-[11px] hover:bg-background/10 disabled:opacity-30"
                  onClick={() => onBranch(message.id)}
                  type="button"
                >
                  <GitBranch className="size-3" />
                  Branch here
                </button>
                {hasSiblings ? (
                  <fieldset className="ml-auto flex items-center gap-0.5">
                    <legend className="sr-only">
                      Branch navigation for {message.id}
                    </legend>
                    <button
                      aria-label={`Previous branch for ${message.id}`}
                      className="grid size-7 place-items-center hover:bg-background/10 disabled:opacity-30"
                      disabled={siblingIndex === 0}
                      onClick={() => navigateToSibling(siblingIndex - 1)}
                      title="Previous version"
                      type="button"
                    >
                      <ChevronLeft className="size-3.5" />
                    </button>
                    <span className="min-w-8 text-center font-mono text-[10px]">
                      {siblingIndex + 1}/{siblings.length}
                    </span>
                    <button
                      aria-label={`Next branch for ${message.id}`}
                      className="grid size-7 place-items-center hover:bg-background/10 disabled:opacity-30"
                      disabled={siblingIndex === siblings.length - 1}
                      onClick={() => navigateToSibling(siblingIndex + 1)}
                      title="Next version"
                      type="button"
                    >
                      <ChevronRight className="size-3.5" />
                    </button>
                  </fieldset>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <form
        className="border-border border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <div className="border border-border focus-within:border-foreground/40">
          <textarea
            aria-label="Message this branch"
            className="block min-h-16 w-full resize-none bg-transparent px-3 py-3 text-sm outline-none"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={`Continue from ${chat.tree.cursorId ?? "root"}`}
            rows={2}
            value={draft}
          />
          <div className="flex items-center justify-between gap-2 border-border border-t p-1.5">
            <label className="flex h-8 items-center gap-1.5 px-2 text-muted-foreground text-xs">
              <GitBranch className="size-3.5" />
              <span>Responses</span>
              <select
                aria-label="Number of responses"
                className="bg-transparent font-mono text-foreground outline-none"
                onChange={(event) =>
                  onResponseCountChange(Number(event.target.value))
                }
                value={responseCount}
              >
                {[1, 2, 3, 4].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                aria-label="Stop all responses"
                className="grid size-8 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                disabled={chat.tree.activeStreams.length === 0}
                onClick={() => chat.tree.stopAllStreams()}
                title="Stop all responses"
                type="button"
              >
                <Square className="size-3.5" />
              </button>
              <button
                aria-label={`Send message with ${responseCount} ${
                  responseCount === 1 ? "response" : "responses"
                }`}
                className="grid size-8 place-items-center bg-primary text-primary-foreground disabled:opacity-40"
                disabled={!draft.trim()}
                title="Send message"
                type="submit"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
          {chat.lastEvent}
        </p>
      </form>
    </section>
  );
}

function TreeCanvas({ chat }: { chat: PlaygroundChat }) {
  const layout = useMemo(
    () =>
      buildTreeLayout({
        childrenByParentId: chat.tree.childrenByParentId,
        rootIds: chat.tree.rootIds,
      }),
    [chat.tree.childrenByParentId, chat.tree.rootIds]
  );
  const activeIds = new Set(chat.messages.map((message) => message.id));
  const streamByMessageId = new Map(
    chat.tree.activeStreams.map((stream) => [stream.assistantMessageId, stream])
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div
        className="relative"
        style={{ height: layout.height, width: layout.width }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 text-border"
          height={layout.height}
          width={layout.width}
        >
          {layout.nodes.flatMap((node) => {
            const children = chat.tree.childrenByParentId[node.id] ?? [];
            return children.map((childId) => {
              const child = layout.positions.get(childId);
              if (!child) {
                return null;
              }
              return (
                <path
                  d={`M${node.x} ${node.y + 25} V${node.y + 52} H${child.x} V${child.y - 25}`}
                  fill="none"
                  key={`${node.id}-${childId}`}
                  stroke="currentColor"
                />
              );
            });
          })}
        </svg>

        {layout.nodes.map((node) => {
          const message = chat.tree.messagesById[node.id];
          if (!message) {
            return null;
          }
          const stream = streamByMessageId.get(node.id);
          const isActive = activeIds.has(node.id);
          const isCursor = chat.tree.cursorId === node.id;
          let nodeClass =
            "border-border bg-card/90 text-muted-foreground hover:border-foreground/40 hover:text-foreground";
          if (isActive) {
            nodeClass = "border-foreground/30 bg-card text-foreground";
          }
          if (isCursor) {
            nodeClass = "border-foreground bg-foreground text-background";
          }

          return (
            <button
              className={`absolute w-36 -translate-x-1/2 -translate-y-1/2 border px-2.5 py-2 text-left shadow-sm transition-colors ${nodeClass}`}
              key={node.id}
              onClick={() => chat.tree.setCursor(node.id)}
              style={{ left: node.x, top: node.y }}
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-[10px] uppercase">
                  {message.role}
                </span>
                <span className="shrink-0 font-mono text-[9px] opacity-60">
                  {stream?.status ?? "ready"}
                </span>
              </span>
              <span className="mt-1 block truncate text-[11px]">
                {getMessageText(message) || "Streaming..."}
              </span>
              <span className="mt-1 block font-mono text-[9px] opacity-55">
                {node.id} · {getMessageText(message).length} chars
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Playground() {
  const [draft, setDraft] = useState("");
  const [responseCount, setResponseCount] = useState(1);
  const idCounter = useRef(100);

  function generateMessageId() {
    idCounter.current += 1;
    return `msg_${idCounter.current}`;
  }

  const chat = useThread<PlaygroundMessage>({
    concurrency: { maxActiveStreams: 8 },
    generateId: generateMessageId,
    initialTree,
    transport: new PlaygroundTransport(),
  });

  function messageInput(text: string, title: string, messageId?: string) {
    return {
      messageId,
      metadata: {
        activeStreamId: null,
        createdAt: new Date().toISOString(),
        title,
      },
      text,
    };
  }

  async function sendDraft() {
    const text = draft.trim();
    if (!text) {
      return;
    }
    const userMessageId = generateMessageId();
    setDraft("");
    await chat.sendMessage(
      messageInput(text, "Playground message", userMessageId),
      {
        tree: {
          responseLabel:
            responseCount === 1
              ? "Assistant reply"
              : `Response 1 of ${responseCount}`,
        },
      }
    );

    for (let index = 1; index < responseCount; index += 1) {
      chat.sendMessage(undefined, {
        tree: {
          follow: false,
          from: userMessageId,
          responseLabel: `Response ${index + 1} of ${responseCount}`,
        },
      });
    }
  }

  function branchFrom(messageId: string) {
    const message = chat.tree.messagesById[messageId];
    if (!message) {
      return;
    }
    chat.tree.setCursor(messageId);
    if (message.role === "user") {
      chat.sendMessage(undefined, {
        tree: { responseLabel: "Alternative response" },
      });
      return;
    }
    chat.sendMessage(
      messageInput(
        `Take another direction from ${messageId}.`,
        "Branch prompt"
      ),
      { tree: { responseLabel: "Branch response" } }
    );
  }

  return (
    <div className="mt-12 overflow-hidden border border-border bg-card shadow-2xl shadow-foreground/5">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-border border-b px-4 py-3">
        <div>
          <p className="font-medium text-sm">useThread playground</p>
          <p className="text-muted-foreground text-xs">
            Real tree state with simulated local streams
          </p>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          {chat.tree.activeStreams.length} active streams
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(28rem,1.05fr)]">
        <Conversation
          chat={chat}
          draft={draft}
          onBranch={branchFrom}
          onDraftChange={setDraft}
          onResponseCountChange={setResponseCount}
          onSend={sendDraft}
          responseCount={responseCount}
        />
        <aside className="flex min-h-[43rem] min-w-0 flex-col border-border border-t bg-muted/15 lg:border-t-0 lg:border-l">
          <header className="flex min-h-16 items-center justify-between border-border border-b px-5 py-3">
            <div>
              <p className="font-medium text-sm">Message tree</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {Object.keys(chat.tree.messagesById).length} nodes ·{" "}
                {chat.tree.activeStreams.length} streams
              </p>
            </div>
            <GitBranch className="size-4 text-muted-foreground" />
          </header>
          <TreeCanvas chat={chat} />
        </aside>
      </div>
    </div>
  );
}

export function ThreadRegistryShowcase() {
  return (
    <>
      <Playground />
      <InstallCommand />
    </>
  );
}
