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
  createCustomChatStore,
} from "@/lib/stores/custom-store-provider";

export interface CreateChatRuntimeStoreInput {
  chatId: string;
  initialMessages?: ChatMessage[];
}

interface ChatRuntimeStoreEntry {
  chatId: string;
  store: CustomChatStoreApi<ChatMessage>;
}

interface ChatRuntimeStoreRegistryContextValue {
  createStoreIfMissing: (
    input: CreateChatRuntimeStoreInput
  ) => CustomChatStoreApi<ChatMessage>;
  entries: ChatRuntimeStoreEntry[];
  getStoreByChatId: (
    chatId: string | null | undefined
  ) => CustomChatStoreApi<ChatMessage> | null;
}

const ChatRuntimeStoreRegistryContext =
  createContext<ChatRuntimeStoreRegistryContextValue | null>(null);

function createStoreEntry(
  input: CreateChatRuntimeStoreInput
): ChatRuntimeStoreEntry {
  return {
    chatId: input.chatId,
    store: createCustomChatStore(input.initialMessages ?? []),
  };
}

function createInitialStoreEntries(
  initialStores: CreateChatRuntimeStoreInput[]
) {
  const entries: ChatRuntimeStoreEntry[] = [];
  const seenChatIds = new Set<string>();

  for (const initialStore of initialStores) {
    if (seenChatIds.has(initialStore.chatId)) {
      continue;
    }

    seenChatIds.add(initialStore.chatId);
    entries.push(createStoreEntry(initialStore));
  }

  return entries;
}

export function ChatRuntimeStoreRegistryProvider({
  children,
  initialStores = [],
}: {
  children: ReactNode;
  initialStores?: CreateChatRuntimeStoreInput[];
}) {
  const [entries, setEntries] = useState<ChatRuntimeStoreEntry[]>(() =>
    createInitialStoreEntries(initialStores)
  );
  const entriesRef = useRef<ChatRuntimeStoreEntry[]>(entries);

  const getStoreByChatId = useCallback((chatId: string | null | undefined) => {
    if (!chatId) {
      return null;
    }

    return (
      entriesRef.current.find((entry) => entry.chatId === chatId)?.store ?? null
    );
  }, []);

  const createStoreIfMissing = useCallback(
    (input: CreateChatRuntimeStoreInput) => {
      const existingStore = getStoreByChatId(input.chatId);

      if (existingStore) {
        return existingStore;
      }

      const entry = createStoreEntry(input);
      const nextEntries = [...entriesRef.current, entry];

      entriesRef.current = nextEntries;
      setEntries(nextEntries);
      return entry.store;
    },
    [getStoreByChatId]
  );

  const value = useMemo(
    () => ({
      createStoreIfMissing,
      entries,
      getStoreByChatId,
    }),
    [createStoreIfMissing, entries, getStoreByChatId]
  );

  return (
    <ChatRuntimeStoreRegistryContext.Provider value={value}>
      {children}
    </ChatRuntimeStoreRegistryContext.Provider>
  );
}

export function useChatRuntimeStoreRegistry() {
  const context = useContext(ChatRuntimeStoreRegistryContext);
  if (!context) {
    throw new Error(
      "useChatRuntimeStoreRegistry must be used within ChatRuntimeStoreRegistryProvider"
    );
  }
  return context;
}

export function useChatRuntimeStoreActions() {
  const { createStoreIfMissing } = useChatRuntimeStoreRegistry();

  return useMemo(
    () => ({
      createStoreIfMissing,
    }),
    [createStoreIfMissing]
  );
}

export function useChatRuntimeStore(chatId: string | null | undefined) {
  const { entries } = useChatRuntimeStoreRegistry();

  if (!chatId) {
    return null;
  }

  return entries.find((entry) => entry.chatId === chatId)?.store ?? null;
}
