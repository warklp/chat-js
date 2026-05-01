"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type RuntimeId = string;

export interface ChatRuntimeEntry {
  runtimeId: RuntimeId;
}

export interface CreateRuntimeInput {
  runtimeId: RuntimeId;
}

interface ChatRuntimeRegistryContextValue {
  createRuntimeIfMissing: (input: CreateRuntimeInput) => ChatRuntimeEntry;
  entries: ChatRuntimeEntry[];
  getRuntimeById: (
    runtimeId: string | null | undefined
  ) => ChatRuntimeEntry | null;
}

const ChatRuntimeRegistryContext =
  createContext<ChatRuntimeRegistryContextValue | null>(null);
const MountedChatRuntimeContext = createContext<ChatRuntimeEntry | null>(null);

function createRuntimeEntry(input: CreateRuntimeInput): ChatRuntimeEntry {
  return {
    runtimeId: input.runtimeId,
  };
}

function createInitialRuntimeEntries(initialRuntimes: CreateRuntimeInput[]) {
  const entries: ChatRuntimeEntry[] = [];
  const seenRuntimeIds = new Set<string>();

  for (const initialRuntime of initialRuntimes) {
    if (seenRuntimeIds.has(initialRuntime.runtimeId)) {
      continue;
    }

    seenRuntimeIds.add(initialRuntime.runtimeId);
    entries.push(createRuntimeEntry(initialRuntime));
  }

  return entries;
}

export function ChatRuntimeRegistryProvider({
  children,
  initialRuntimes = [],
}: {
  children: ReactNode;
  initialRuntimes?: CreateRuntimeInput[];
}) {
  const [entries, setEntries] = useState<ChatRuntimeEntry[]>(() =>
    createInitialRuntimeEntries(initialRuntimes)
  );
  const entriesRef = useRef<ChatRuntimeEntry[]>(entries);

  const getRuntimeById = useCallback(
    (runtimeId: string | null | undefined) =>
      runtimeId
        ? (entriesRef.current.find((entry) => entry.runtimeId === runtimeId) ??
          null)
        : null,
    []
  );

  const createRuntimeIfMissing = useCallback((input: CreateRuntimeInput) => {
    const existingRuntime = entriesRef.current.find(
      (entry) => entry.runtimeId === input.runtimeId
    );

    if (existingRuntime) {
      return existingRuntime;
    }

    const runtime = createRuntimeEntry(input);
    const nextEntries = [...entriesRef.current, runtime];

    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    return runtime;
  }, []);

  const value = useMemo(
    () => ({
      createRuntimeIfMissing,
      entries,
      getRuntimeById,
    }),
    [createRuntimeIfMissing, entries, getRuntimeById]
  );

  return (
    <ChatRuntimeRegistryContext.Provider value={value}>
      {children}
    </ChatRuntimeRegistryContext.Provider>
  );
}

export function useChatRuntimeRegistry() {
  const context = useContext(ChatRuntimeRegistryContext);
  if (!context) {
    throw new Error(
      "useChatRuntimeRegistry must be used within ChatRuntimeRegistryProvider"
    );
  }
  return context;
}

function MountedChatRuntime({
  children,
  runtime,
}: {
  children: ReactNode;
  runtime: ChatRuntimeEntry;
}) {
  return (
    <MountedChatRuntimeContext.Provider value={runtime}>
      {children}
    </MountedChatRuntimeContext.Provider>
  );
}

export function useMountedChatRuntime() {
  const runtime = useContext(MountedChatRuntimeContext);
  if (!runtime) {
    throw new Error(
      "useMountedChatRuntime must be used within MountedChatRuntimes"
    );
  }
  return runtime;
}

export function MountedChatRuntimes({
  children,
}: {
  children: (runtime: ChatRuntimeEntry) => ReactNode;
}) {
  const { entries } = useChatRuntimeRegistry();

  return (
    <>
      {entries.map((runtime) => (
        <MountedChatRuntime key={runtime.runtimeId} runtime={runtime}>
          {children(runtime)}
        </MountedChatRuntime>
      ))}
    </>
  );
}
