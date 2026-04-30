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
import type { ChatMessage } from "@/lib/ai/types";
import {
  type CustomChatStoreApi,
  CustomStoreProvider,
  createCustomChatStore,
} from "@/lib/stores/custom-store-provider";

export type ChatRuntimeId = `chat:${string}`;

export interface ChatRuntimeEntry {
  chatId: string;
  projectId: string | null;
  runtimeId: ChatRuntimeId;
  store: CustomChatStoreApi<ChatMessage>;
}

export interface CreateRuntimeInput {
  chatId: string;
  initialMessages?: ChatMessage[];
  projectId: string | null;
}

interface ChatRuntimeRegistryContextValue {
  createRuntimeIfMissing: (input: CreateRuntimeInput) => ChatRuntimeEntry;
  entries: ChatRuntimeEntry[];
  getRuntimeByChatId: (
    chatId: string | null | undefined
  ) => ChatRuntimeEntry | null;
}

const ChatRuntimeRegistryContext =
  createContext<ChatRuntimeRegistryContextValue | null>(null);
const MountedChatRuntimeContext = createContext<ChatRuntimeEntry | null>(null);

function createRuntimeEntry(input: CreateRuntimeInput): ChatRuntimeEntry {
  return {
    chatId: input.chatId,
    projectId: input.projectId,
    runtimeId: `chat:${input.chatId}`,
    store: createCustomChatStore(input.initialMessages ?? []),
  };
}

function createInitialRuntimeEntries(initialRuntimes: CreateRuntimeInput[]) {
  const entries: ChatRuntimeEntry[] = [];
  const seenChatIds = new Set<string>();

  for (const initialRuntime of initialRuntimes) {
    if (seenChatIds.has(initialRuntime.chatId)) {
      continue;
    }

    seenChatIds.add(initialRuntime.chatId);
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

  const getRuntimeByChatId = useCallback(
    (chatId: string | null | undefined) =>
      chatId
        ? (entriesRef.current.find((entry) => entry.chatId === chatId) ?? null)
        : null,
    []
  );

  const createRuntimeIfMissing = useCallback((input: CreateRuntimeInput) => {
    const existingRuntime = entriesRef.current.find(
      (entry) => entry.chatId === input.chatId
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
      getRuntimeByChatId,
    }),
    [createRuntimeIfMissing, entries, getRuntimeByChatId]
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
    <CustomStoreProvider<ChatMessage> store={runtime.store}>
      <MountedChatRuntimeContext.Provider value={runtime}>
        {children}
      </MountedChatRuntimeContext.Provider>
    </CustomStoreProvider>
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

export function MountedChatRuntimes({ children }: { children: ReactNode }) {
  const { entries } = useChatRuntimeRegistry();

  return (
    <>
      {entries.map((runtime) => (
        <MountedChatRuntime key={runtime.runtimeId} runtime={runtime}>
          {children}
        </MountedChatRuntime>
      ))}
    </>
  );
}
