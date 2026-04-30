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
import type { UseChatHelpers } from "@/lib/stores/base";
import {
  type CustomChatStoreApi,
  CustomStoreProvider,
  createCustomChatStore,
} from "@/lib/stores/custom-store-provider";

export type ChatRuntimeId = `chat:${string}`;

export interface PendingChatSubmission {
  message: ChatMessage;
  options?: Parameters<UseChatHelpers<ChatMessage>["sendMessage"]>[1];
}

export interface ChatRuntimeEntry {
  chatId: string;
  pendingSubmission: PendingChatSubmission | null;
  projectId: string | null;
  runtimeId: ChatRuntimeId;
  store: CustomChatStoreApi<ChatMessage>;
}

export interface EnsureRuntimeInput {
  chatId: string;
  initialMessages?: ChatMessage[];
  projectId: string | null;
}

export interface SubmitRuntimeInput {
  chatId: string;
  pendingSubmission: PendingChatSubmission;
  projectId: string | null;
}

interface ChatRuntimeRegistryContextValue {
  ensureRuntime: (input: EnsureRuntimeInput) => ChatRuntimeEntry;
  entries: ChatRuntimeEntry[];
  getRuntimeByChatId: (
    chatId: string | null | undefined
  ) => ChatRuntimeEntry | null;
  markPendingSubmissionStarted: (runtimeId: ChatRuntimeId) => void;
  submitRuntime: (input: SubmitRuntimeInput) => boolean;
}

const ChatRuntimeRegistryContext =
  createContext<ChatRuntimeRegistryContextValue | null>(null);
const MountedChatRuntimeContext = createContext<ChatRuntimeEntry | null>(null);

export function ChatRuntimeRegistryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<ChatRuntimeEntry[]>([]);
  const entriesRef = useRef<ChatRuntimeEntry[]>([]);

  const getRuntimeByChatId = useCallback(
    (chatId: string | null | undefined) =>
      chatId
        ? (entriesRef.current.find((entry) => entry.chatId === chatId) ?? null)
        : null,
    []
  );

  const publishEntries = useCallback((nextEntries: ChatRuntimeEntry[]) => {
    entriesRef.current = nextEntries;
    queueMicrotask(() => {
      setEntries(entriesRef.current);
    });
  }, []);

  const ensureRuntime = useCallback(
    (input: EnsureRuntimeInput) => {
      const existingRuntime = entriesRef.current.find(
        (entry) => entry.chatId === input.chatId
      );

      if (existingRuntime) {
        return existingRuntime;
      }

      const runtime: ChatRuntimeEntry = {
        chatId: input.chatId,
        pendingSubmission: null,
        projectId: input.projectId,
        runtimeId: `chat:${input.chatId}`,
        store: createCustomChatStore(input.initialMessages ?? []),
      };

      publishEntries([...entriesRef.current, runtime]);
      return runtime;
    },
    [publishEntries]
  );

  const submitRuntime = useCallback((input: SubmitRuntimeInput) => {
    const runtime = entriesRef.current.find(
      (entry) => entry.chatId === input.chatId
    );

    if (!runtime) {
      return false;
    }

    const nextEntries = entriesRef.current.map((entry) =>
      entry.runtimeId === runtime.runtimeId
        ? {
            ...entry,
            pendingSubmission: input.pendingSubmission,
            projectId: input.projectId,
          }
        : entry
    );
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    return true;
  }, []);

  const markPendingSubmissionStarted = useCallback(
    (runtimeId: ChatRuntimeId) => {
      const runtime = entriesRef.current.find(
        (entry) => entry.runtimeId === runtimeId
      );

      if (!runtime?.pendingSubmission) {
        return;
      }

      const nextEntries = entriesRef.current.map((entry) =>
        entry.runtimeId === runtimeId
          ? { ...entry, pendingSubmission: null }
          : entry
      );
      entriesRef.current = nextEntries;
      setEntries(nextEntries);
    },
    []
  );

  const value = useMemo(
    () => ({
      ensureRuntime,
      entries,
      getRuntimeByChatId,
      markPendingSubmissionStarted,
      submitRuntime,
    }),
    [
      ensureRuntime,
      entries,
      getRuntimeByChatId,
      markPendingSubmissionStarted,
      submitRuntime,
    ]
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
