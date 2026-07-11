const TRACE_PREFIX = "[THREAD-TRACE]";
const TRACE_STORAGE_KEY = "chatjs:thread-debug";
const TRACE_QUERY_PARAM = "threadDebug";
const MAX_TRACE_ENTRIES = 1000;

export interface ThreadTraceEntry {
  data: unknown;
  event: string;
  scope: string;
  sequence: number;
  timestamp: string;
}

interface DebugMessage {
  id: string;
  metadata?: unknown;
  parts?: unknown;
  role: string;
}

interface DebugMetadata {
  activeStreamId?: string | null;
  parallelGroupId?: string | null;
  parallelIndex?: number | null;
  parentMessageId?: string | null;
}

interface DebugPart {
  text?: string;
  type?: string;
}

interface DebugTreeSnapshot {
  childrenByParentId: Record<string, string[]>;
  cursorId: string | null;
  messagesById: Record<string, DebugMessage>;
  parentById: Record<string, string | null>;
}

declare global {
  interface Window {
    __CHATJS_THREAD_DEBUG_ENABLED__?: boolean;
    __CHATJS_THREAD_TRACE__?: ThreadTraceEntry[];
    __CHATJS_THREAD_TRACE_CLEAR__?: () => void;
    __CHATJS_THREAD_TRACE_EXPORT__?: () => string;
  }
}

function isTraceEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  const queryValue = new URLSearchParams(window.location.search).get(
    TRACE_QUERY_PARAM
  );
  if (queryValue === "1") {
    window.__CHATJS_THREAD_DEBUG_ENABLED__ = true;
    try {
      window.localStorage?.setItem(TRACE_STORAGE_KEY, "1");
    } catch {
      // Storage can be unavailable in embedded browsers.
    }
    return true;
  }
  if (queryValue === "0") {
    window.__CHATJS_THREAD_DEBUG_ENABLED__ = false;
    try {
      window.localStorage?.removeItem(TRACE_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in embedded browsers.
    }
    return false;
  }

  if (window.__CHATJS_THREAD_DEBUG_ENABLED__ !== undefined) {
    return window.__CHATJS_THREAD_DEBUG_ENABLED__;
  }

  try {
    if (window.localStorage?.getItem(TRACE_STORAGE_KEY) === "1") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function getTraceBuffer() {
  const buffer = window.__CHATJS_THREAD_TRACE__ ?? [];
  window.__CHATJS_THREAD_TRACE__ = buffer;
  window.__CHATJS_THREAD_TRACE_CLEAR__ = () => {
    buffer.length = 0;
  };
  window.__CHATJS_THREAD_TRACE_EXPORT__ = () => JSON.stringify(buffer, null, 2);
  return buffer;
}

function cloneTraceData(data: unknown) {
  try {
    return JSON.parse(JSON.stringify(data)) as unknown;
  } catch {
    return String(data);
  }
}

export function summarizeThreadMessages(messages: DebugMessage[]) {
  return messages.map((message) => {
    const metadata =
      message.metadata && typeof message.metadata === "object"
        ? (message.metadata as DebugMetadata)
        : undefined;
    const parts = Array.isArray(message.parts)
      ? (message.parts as DebugPart[])
      : [];

    return {
      activeStreamId: metadata?.activeStreamId ?? null,
      id: message.id,
      parallelGroupId: metadata?.parallelGroupId ?? null,
      parallelIndex: metadata?.parallelIndex ?? null,
      parentMessageId: metadata?.parentMessageId ?? null,
      role: message.role,
      textLength: parts.reduce(
        (total, part) =>
          total + (part.type === "text" ? (part.text?.length ?? 0) : 0),
        0
      ),
    };
  });
}

export function summarizeThreadTree(snapshot: DebugTreeSnapshot) {
  return {
    cursorId: snapshot.cursorId,
    edgeCount: Object.values(snapshot.childrenByParentId).reduce(
      (total, children) => total + children.length,
      0
    ),
    messages: summarizeThreadMessages(Object.values(snapshot.messagesById)),
    nodeCount: Object.keys(snapshot.messagesById).length,
    parentById: snapshot.parentById,
  };
}

export function traceThread(scope: string, event: string, data: unknown = {}) {
  if (!isTraceEnabled()) {
    return;
  }

  const buffer = getTraceBuffer();
  const entry: ThreadTraceEntry = {
    data: cloneTraceData(data),
    event,
    scope,
    sequence: (buffer.at(-1)?.sequence ?? 0) + 1,
    timestamp: new Date().toISOString(),
  };

  buffer.push(entry);
  if (buffer.length > MAX_TRACE_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_TRACE_ENTRIES);
  }
  console.info(TRACE_PREFIX, entry);
}
