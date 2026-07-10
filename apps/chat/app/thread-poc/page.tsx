"use client";

import {
  GitBranch,
  MessageSquare,
  MousePointer2,
  Send,
  Square,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { type PocMessage, readText, useThread } from "./use-thread";

type NodeStats = {
  aggregateChars: number;
  descendants: number;
};

type LayoutNode = {
  depth: number;
  id: string;
  kind: "message" | "root";
  x: number;
  y: number;
};

type LayoutEdge = {
  from: string;
  to: string;
};

const GRAPH_NODE_WIDTH = 190;
const GRAPH_NODE_HEIGHT = 126;
const GRAPH_X_GAP = 30;
const GRAPH_Y_GAP = 78;
const GRAPH_PADDING = 20;
const THREAD_ROOT_ID = "__thread_root__";

function buildNodeStats({
  childrenByParentId,
  messagesById,
}: {
  childrenByParentId: Record<string, string[]>;
  messagesById: Record<string, PocMessage>;
}) {
  const stats: Record<string, NodeStats> = {};

  const visit = (messageId: string): NodeStats => {
    const message = messagesById[messageId];
    const children = childrenByParentId[messageId] ?? [];
    let aggregateChars = message ? readText(message).length : 0;
    let descendants = 0;

    for (const childId of children) {
      const childStats = visit(childId);
      aggregateChars += childStats.aggregateChars;
      descendants += 1 + childStats.descendants;
    }

    stats[messageId] = { aggregateChars, descendants };
    return stats[messageId];
  };

  for (const rootId of childrenByParentId.__root__ ?? []) {
    visit(rootId);
  }

  return stats;
}

function buildTreeLayout({
  childrenByParentId,
  rootIds,
}: {
  childrenByParentId: Record<string, string[]>;
  rootIds: string[];
}) {
  const edges: LayoutEdge[] = [];
  const nodes: LayoutNode[] = [];
  let column = 0;

  const visit = (messageId: string, depth: number): number => {
    const children = childrenByParentId[messageId] ?? [];
    const childXs: number[] = [];

    for (const childId of children) {
      edges.push({ from: messageId, to: childId });
      childXs.push(visit(childId, depth + 1));
    }

    const x =
      childXs.length > 0
        ? childXs.reduce((total, childX) => total + childX, 0) / childXs.length
        : GRAPH_PADDING + column++ * (GRAPH_NODE_WIDTH + GRAPH_X_GAP);

    nodes.push({
      depth,
      id: messageId,
      kind: "message",
      x,
      y: GRAPH_PADDING + depth * (GRAPH_NODE_HEIGHT + GRAPH_Y_GAP),
    });

    return x;
  };

  const rootXs: number[] = [];
  for (const rootId of rootIds) {
    edges.push({ from: THREAD_ROOT_ID, to: rootId });
    rootXs.push(visit(rootId, 1));
  }

  const rootX =
    rootXs.length > 0
      ? rootXs.reduce((total, x) => total + x, 0) / rootXs.length
      : GRAPH_PADDING;

  nodes.push({
    depth: 0,
    id: THREAD_ROOT_ID,
    kind: "root",
    x: rootX,
    y: GRAPH_PADDING,
  });

  const width =
    nodes.length > 0
      ? Math.max(...nodes.map((node) => node.x)) +
        GRAPH_NODE_WIDTH +
        GRAPH_PADDING
      : GRAPH_NODE_WIDTH + GRAPH_PADDING * 2;
  const height =
    nodes.length > 0
      ? Math.max(...nodes.map((node) => node.y)) +
        GRAPH_NODE_HEIGHT +
        GRAPH_PADDING
      : GRAPH_NODE_HEIGHT + GRAPH_PADDING * 2;

  return {
    edges,
    height,
    nodes,
    nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
    width,
  };
}

function messageStatus(message: PocMessage, cursorId: string | null) {
  if (message.metadata?.activeStreamId) {
    return "streaming";
  }
  if (message.id === cursorId) {
    return "cursor";
  }
  return "ready";
}

function StatusDot({ status }: { status: string }) {
  let className = "bg-muted-foreground/40";
  if (status === "streaming") {
    className = "bg-amber-500";
  } else if (status === "cursor") {
    className = "bg-emerald-500";
  }

  return <span className={`mt-1.5 size-2 rounded-full ${className}`} />;
}

function ThreadGraphNode({
  childrenByParentId,
  cursorId,
  layoutNode,
  messageId,
  messagesById,
  nodeStats,
  onBranch,
  onSelect,
  parentById,
}: {
  childrenByParentId: Record<string, string[]>;
  cursorId: string | null;
  layoutNode: LayoutNode;
  messageId: string;
  messagesById: Record<string, PocMessage>;
  nodeStats: Record<string, NodeStats>;
  onBranch: (messageId: string) => void;
  onSelect: (messageId: string) => void;
  parentById: Record<string, string | null>;
}) {
  const message = messagesById[messageId];
  if (!message) {
    return null;
  }

  const children = childrenByParentId[messageId] ?? [];
  const stats = nodeStats[messageId] ?? { aggregateChars: 0, descendants: 0 };
  const status = messageStatus(message, cursorId);
  const text = readText(message);
  const isCursor = cursorId === message.id;

  return (
    <div
      className={`group absolute flex gap-2 rounded-md border px-2.5 py-2 text-sm shadow-sm transition ${
        isCursor
          ? "border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-50"
          : "border-border bg-background hover:bg-muted/60"
      }`}
      data-depth={layoutNode.depth}
      style={{
        height: GRAPH_NODE_HEIGHT,
        left: layoutNode.x,
        top: layoutNode.y,
        width: GRAPH_NODE_WIDTH,
      }}
    >
      <span
        aria-hidden="true"
        className={`absolute top-4 -left-[3px] h-8 w-1 rounded-full ${
          message.role === "user" ? "bg-sky-500" : "bg-violet-500"
        }`}
      />
      <StatusDot status={status} />
      <button
        className="min-w-0 flex-1 text-left"
        data-testid={`tree-node-${message.id}`}
        onClick={() => onSelect(message.id)}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-medium">
            {message.role === "user" ? "User" : "Assistant"}
          </span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {message.id}
          </span>
        </div>
        <div className="mt-1 line-clamp-2 text-muted-foreground text-xs">
          {text || "Waiting for first chunk..."}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span>{children.length} children</span>
          <span>{stats.descendants} desc</span>
          <span>{stats.aggregateChars} chars</span>
          <span>{status}</span>
        </div>
        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          parent {parentById[message.id] ?? "root"}
        </div>
      </button>
      <button
        aria-label={`Branch from ${message.id}`}
        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground opacity-80 hover:bg-background hover:text-foreground group-hover:opacity-100"
        data-testid={`branch-from-${message.id}`}
        onClick={() => onBranch(message.id)}
        title="Branch from this message"
        type="button"
      >
        <GitBranch className="size-3.5" />
      </button>
    </div>
  );
}

function ThreadRootGraphNode({
  cursorId,
  layoutNode,
  rootCount,
  totalMessages,
  onSelectRoot,
}: {
  cursorId: string | null;
  layoutNode: LayoutNode;
  rootCount: number;
  totalMessages: number;
  onSelectRoot: () => void;
}) {
  const isCursor = cursorId === null;

  return (
    <button
      className={`absolute rounded-md border px-3 py-2 text-left text-sm shadow-sm transition ${
        isCursor
          ? "border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-50"
          : "border-border border-dashed bg-background hover:bg-muted/60"
      }`}
      data-depth={layoutNode.depth}
      data-testid="tree-node-root"
      onClick={onSelectRoot}
      style={{
        height: GRAPH_NODE_HEIGHT,
        left: layoutNode.x,
        top: layoutNode.y,
        width: GRAPH_NODE_WIDTH,
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute top-4 -left-[3px] h-8 w-1 rounded-full bg-foreground"
      />
      <div className="font-medium">Thread root</div>
      <div className="mt-1 text-muted-foreground text-xs">
        UI-only anchor for root messages.
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px] text-muted-foreground">
        <span>{rootCount} roots</span>
        <span>{totalMessages} messages</span>
        <span>not persisted</span>
        <span>{isCursor ? "cursor" : "view"}</span>
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
        parent none
      </div>
    </button>
  );
}

function ThreadTreeCanvas({
  childrenByParentId,
  cursorId,
  layout,
  messagesById,
  nodeStats,
  onBranch,
  onSelect,
  parentById,
  rootIds,
}: {
  childrenByParentId: Record<string, string[]>;
  cursorId: string | null;
  layout: ReturnType<typeof buildTreeLayout>;
  messagesById: Record<string, PocMessage>;
  nodeStats: Record<string, NodeStats>;
  onBranch: (messageId: string) => void;
  onSelect: (messageId: string | null) => void;
  parentById: Record<string, string | null>;
  rootIds: string[];
}) {
  const messageNodeCount = layout.nodes.filter(
    (node) => node.kind === "message"
  ).length;

  return (
    <div className="h-full overflow-auto rounded-lg border bg-muted/20">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 text-muted-foreground text-xs backdrop-blur">
        <span className="font-medium uppercase">Top-down message tree</span>
        <span className="font-mono">
          {messageNodeCount} messages · {layout.edges.length} edges
        </span>
      </div>
      <div
        className="relative"
        data-testid="tree-xy-canvas"
        style={{ height: layout.height, width: layout.width }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0"
          height={layout.height}
          width={layout.width}
        >
          <defs>
            <marker
              id="thread-edge-arrow"
              markerHeight="7"
              markerWidth="7"
              orient="auto"
              refX="6"
              refY="3.5"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" />
            </marker>
          </defs>
          <g className="text-border">
            {layout.edges.map((edge) => {
              const from = layout.nodesById[edge.from];
              const to = layout.nodesById[edge.to];
              if (!(from && to)) {
                return null;
              }

              const startX = from.x + GRAPH_NODE_WIDTH / 2;
              const startY = from.y + GRAPH_NODE_HEIGHT;
              const endX = to.x + GRAPH_NODE_WIDTH / 2;
              const endY = to.y;
              const curveY = Math.max(36, (endY - startY) / 2);

              return (
                <path
                  className="stroke-current"
                  d={`M ${startX} ${startY} C ${startX} ${startY + curveY}, ${endX} ${
                    endY - curveY
                  }, ${endX} ${endY}`}
                  fill="none"
                  key={`${edge.from}-${edge.to}`}
                  markerEnd="url(#thread-edge-arrow)"
                  strokeWidth="1.5"
                />
              );
            })}
          </g>
        </svg>

        {layout.nodes.map((layoutNode) =>
          layoutNode.kind === "root" ? (
            <ThreadRootGraphNode
              cursorId={cursorId}
              key={layoutNode.id}
              layoutNode={layoutNode}
              onSelectRoot={() => onSelect(null)}
              rootCount={rootIds.length}
              totalMessages={messageNodeCount}
            />
          ) : (
            <ThreadGraphNode
              childrenByParentId={childrenByParentId}
              cursorId={cursorId}
              key={layoutNode.id}
              layoutNode={layoutNode}
              messageId={layoutNode.id}
              messagesById={messagesById}
              nodeStats={nodeStats}
              onBranch={onBranch}
              onSelect={onSelect}
              parentById={parentById}
            />
          )
        )}
      </div>
    </div>
  );
}

function ChatMessage({
  cursorId,
  message,
  onBranch,
  onSelect,
  parentId,
}: {
  cursorId: string | null;
  message: PocMessage;
  onBranch: (messageId: string) => void;
  onSelect: (messageId: string) => void;
  parentId: string | null;
}) {
  const isUser = message.role === "user";
  const isCursor = cursorId === message.id;
  const isStreaming = Boolean(message.metadata?.activeStreamId);
  let bubbleClassName = "border-border bg-background";
  if (isUser) {
    bubbleClassName = "border-foreground bg-foreground text-background";
  } else if (isCursor) {
    bubbleClassName = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30";
  }

  return (
    <article
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`thread-message-${message.id}`}
    >
      <div
        className={`max-w-[78%] rounded-lg border px-4 py-3 text-sm shadow-sm ${bubbleClassName}`}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="size-4 shrink-0" />
            <span className="font-medium">{isUser ? "You" : "Assistant"}</span>
            <span
              className={`truncate font-mono text-[11px] ${
                isUser ? "text-background/70" : "text-muted-foreground"
              }`}
            >
              {message.id}
            </span>
            {isCursor ? (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                cursor
              </span>
            ) : null}
            {isStreaming ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                streaming
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label={`Select ${message.id}`}
              className={`inline-flex size-7 items-center justify-center rounded-md border ${
                isUser
                  ? "border-background/30 text-background/70 hover:bg-background/10"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => onSelect(message.id)}
              title="Move cursor here"
              type="button"
            >
              <MousePointer2 className="size-3.5" />
            </button>
            <button
              aria-label={`Branch from ${message.id}`}
              className={`inline-flex size-7 items-center justify-center rounded-md border ${
                isUser
                  ? "border-background/30 text-background/70 hover:bg-background/10"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              data-testid={`thread-branch-from-${message.id}`}
              onClick={() => onBranch(message.id)}
              title="Branch from this message"
              type="button"
            >
              <GitBranch className="size-3.5" />
            </button>
          </div>
        </div>
        <p className="whitespace-pre-wrap leading-6">
          {readText(message) || "Waiting for first chunk..."}
        </p>
        <div
          className={`mt-2 font-mono text-[10px] ${
            isUser ? "text-background/60" : "text-muted-foreground"
          }`}
        >
          parent {parentId ?? "root"} · {readText(message).length} chars
        </div>
      </div>
    </article>
  );
}

function Stat({
  label,
  testId,
  value,
}: {
  label: string;
  testId?: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-muted-foreground text-xs">{label}</div>
      <div className="truncate font-mono text-sm" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

export default function ThreadPocPage() {
  const chat = useThread({
    concurrency: {
      maxStreamsPerOrigin: 3,
      maxStreamsTotal: 8,
    },
  });
  const [draft, setDraft] = useState("");

  const nodeStats = useMemo(
    () =>
      buildNodeStats({
        childrenByParentId: chat.tree.childrenByParentId,
        messagesById: chat.tree.messagesById,
      }),
    [chat.tree.childrenByParentId, chat.tree.messagesById]
  );
  const treeLayout = useMemo(
    () =>
      buildTreeLayout({
        childrenByParentId: chat.tree.childrenByParentId,
        rootIds: chat.tree.rootIds,
      }),
    [chat.tree.childrenByParentId, chat.tree.rootIds]
  );
  const messageCount = Object.keys(chat.tree.messagesById).length;
  const edgeCount = Object.values(chat.tree.childrenByParentId).reduce(
    (total, children) => total + children.length,
    0
  );
  const cursorMessage = chat.tree.cursorId
    ? chat.tree.messagesById[chat.tree.cursorId]
    : null;

  const sendDraft = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    chat.sendMessage(
      {
        metadata: {
          activeStreamId: null,
          createdAt: new Date().toISOString(),
          title: "Follow up",
        },
        text,
      },
      {
        tree: {
          responseLabel: "Assistant reply",
        },
      }
    );
    setDraft("");
  };

  const branchFromMessage = (messageId: string) => {
    const message = chat.tree.messagesById[messageId];
    if (!message) {
      return;
    }

    chat.tree.setCursor(messageId);
    if (message.role === "user") {
      chat.sendMessage(undefined, {
        tree: {
          responseLabel: "Branch response",
        },
      });
      return;
    }

    chat.sendMessage(
      {
        metadata: {
          activeStreamId: null,
          createdAt: new Date().toISOString(),
          title: "Branch prompt",
        },
        text: `Branch from ${messageId}`,
      },
      {
        tree: {
          responseLabel: "Branch reply",
        },
      }
    );
  };

  const editUserAAsBranch = () => {
    chat.tree.setCursorToParentOf("user-a");
    chat.sendMessage(
      {
        metadata: {
          activeStreamId: null,
          createdAt: new Date().toISOString(),
          title: "Edited user-a",
        },
        text: "Plan a launch checklist with risks called out first",
      },
      {
        tree: {
          responseLabel: "Edited branch",
        },
      }
    );
  };

  const startParallelResponsesFromUserA = () => {
    chat.tree.setCursor("user-a");
    for (const [index, follow] of [true, false, false].entries()) {
      chat.sendMessage(undefined, {
        tree: {
          follow,
          from: "user-a",
          responseLabel: `Parallel ${index + 1}`,
        },
      });
    }
  };

  return (
    <main className="min-h-screen bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="font-semibold text-2xl">useThread demo</h1>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
              Chat UI backed by a normalized message tree. The conversation
              shows the selected cursor path; the side panel exposes every node,
              stream status, and aggregate content size.
            </p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
            <Stat label="status" testId="chat-status" value={chat.status} />
            <Stat
              label="cursor"
              testId="selected-leaf"
              value={chat.tree.cursorId ?? "root"}
            />
            <Stat
              label="nodes"
              testId="tree-message-count"
              value={messageCount}
            />
            <Stat
              label="streams"
              testId="active-stream-count"
              value={chat.tree.activeStreams.length}
            />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.8fr)]">
          <section className="flex min-h-[720px] flex-col rounded-lg border bg-muted/10">
            <div className="border-b p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-medium">Conversation</h2>
                  <p className="text-muted-foreground text-sm">
                    `messages` contains this cursor path.
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <Stat
                    label="path"
                    testId="active-thread-count"
                    value={`${chat.messages.length}`}
                  />
                  <Stat
                    label="roots"
                    testId="root-branch-count"
                    value={chat.tree.rootIds.length}
                  />
                  <Stat
                    label="edges"
                    testId="tree-edge-count"
                    value={edgeCount}
                  />
                  <Stat
                    label="cursor role"
                    value={cursorMessage?.role ?? "root"}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted"
                  data-testid="edit-branch"
                  onClick={editUserAAsBranch}
                  type="button"
                >
                  <WandSparkles className="size-4" />
                  Edit user-a as branch
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted"
                  data-testid="start-concurrent"
                  onClick={startParallelResponsesFromUserA}
                  type="button"
                >
                  <GitBranch className="size-4" />3 parallel responses
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted"
                  data-testid="stop-all"
                  onClick={() => chat.tree.stopAllStreams()}
                  type="button"
                >
                  <Square className="size-4" />
                  Stop all
                </button>
              </div>
            </div>

            <div
              className="flex-1 space-y-4 overflow-y-auto p-4"
              data-testid="visible-thread"
            >
              {chat.messages.map((message) => (
                <ChatMessage
                  cursorId={chat.tree.cursorId}
                  key={message.id}
                  message={message}
                  onBranch={branchFromMessage}
                  onSelect={chat.tree.setCursor}
                  parentId={chat.tree.parentById[message.id] ?? null}
                />
              ))}
            </div>

            <form
              className="border-t bg-background p-4"
              onSubmit={(event) => {
                event.preventDefault();
                sendDraft();
              }}
            >
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  data-testid="composer-input"
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Send from ${chat.tree.cursorId ?? "root"}`}
                  value={draft}
                />
                <button
                  className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-background text-sm disabled:opacity-50"
                  data-testid="composer-send"
                  disabled={!draft.trim()}
                  type="submit"
                >
                  <Send className="size-4" />
                  Send
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                <span>cursor: {chat.tree.cursorId ?? "root"}</span>
                <span>last: {chat.lastEvent}</span>
                <span>compat: messages = cursor path</span>
              </div>
            </form>
          </section>

          <aside className="flex min-h-[720px] flex-col rounded-lg border bg-background">
            <div className="border-b p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-medium">Thread nodes</h2>
                  <p className="text-muted-foreground text-sm">
                    ids, status, content aggregate
                  </p>
                </div>
                <span className="rounded-full border px-2 py-1 font-mono text-xs">
                  {messageCount} nodes
                </span>
              </div>
              {chat.tree.activeStreams.length > 0 ? (
                <div
                  className="mt-3 space-y-2"
                  data-testid="active-streams-panel"
                >
                  {chat.tree.activeStreams.map((stream) => (
                    <div
                      className="rounded-md border bg-muted/40 px-2.5 py-2 text-xs"
                      data-testid={`active-stream-${stream.assistantMessageId}`}
                      key={stream.streamId}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-mono">{stream.streamId}</span>
                        <span>
                          {stream.follow ? "following" : "background"}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {stream.status} · origin{" "}
                        {stream.originCursorId ?? "root"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  className="mt-3 text-muted-foreground text-sm"
                  data-testid="no-active-streams"
                >
                  No active streams
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3" data-testid="tree-root">
              <ThreadTreeCanvas
                childrenByParentId={chat.tree.childrenByParentId}
                cursorId={chat.tree.cursorId}
                layout={treeLayout}
                messagesById={chat.tree.messagesById}
                nodeStats={nodeStats}
                onBranch={branchFromMessage}
                onSelect={chat.tree.setCursor}
                parentById={chat.tree.parentById}
                rootIds={chat.tree.rootIds}
              />
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
