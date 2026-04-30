"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ChatSync } from "@/components/chat-sync";
import type { ChatMessage } from "@/lib/ai/types";
import type { ParallelRequestSpec } from "@/lib/draft-chat-submission";
import {
  markParallelRequestSpecsFailed,
  runParallelRequestSpecs,
} from "@/lib/parallel-chat-requests";
import type { UseChatHelpers } from "@/lib/stores/base";
import {
  type CustomChatStoreApi,
  CustomStoreProvider,
  createCustomChatStore,
} from "@/lib/stores/custom-store-provider";
import { useAddMessageToTree } from "@/lib/stores/hooks-threads";
import { useTRPC } from "@/trpc/react";

export type ChatRuntimeId = `chat:${string}`;

export interface PendingChatSubmission {
  message: ChatMessage;
  options?: Parameters<UseChatHelpers<ChatMessage>["sendMessage"]>[1];
}

export interface ChatRuntimeEntry {
  chatId: string;
  pendingSubmission: PendingChatSubmission | null;
  persistenceStatus: "confirmed" | "provisional";
  projectId: string | null;
  requestSpecs: ParallelRequestSpec[];
  runtimeId: ChatRuntimeId;
  store: CustomChatStoreApi<ChatMessage>;
  submittedMessage: ChatMessage | null;
}

export interface StartConfirmedRuntimeInput {
  chatId: string;
  initialMessages?: ChatMessage[];
  projectId: string | null;
}

export interface EnsureProvisionalRuntimeInput {
  chatId: string;
  projectId: string | null;
}

export interface SubmitProvisionalRuntimeInput {
  chatId: string;
  pendingSubmission: PendingChatSubmission;
  projectId: string | null;
  requestSpecs: ParallelRequestSpec[];
}

interface ChatRuntimeRegistryContextValue {
  ensureConfirmedRuntime: (
    input: StartConfirmedRuntimeInput
  ) => ChatRuntimeEntry;
  ensureProvisionalRuntime: (
    input: EnsureProvisionalRuntimeInput
  ) => ChatRuntimeEntry;
  entries: ChatRuntimeEntry[];
  getRuntimeByChatId: (
    chatId: string | null | undefined
  ) => ChatRuntimeEntry | null;
  markPendingSubmissionStarted: (runtimeId: ChatRuntimeId) => void;
  markRuntimeConfirmed: (runtimeId: ChatRuntimeId) => void;
  submitProvisionalRuntime: (input: SubmitProvisionalRuntimeInput) => boolean;
}

const ChatRuntimeRegistryContext =
  createContext<ChatRuntimeRegistryContextValue | null>(null);

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

  const ensureConfirmedRuntime = useCallback(
    (input: StartConfirmedRuntimeInput) => {
      const existingRuntime = entriesRef.current.find(
        (entry) => entry.chatId === input.chatId
      );

      if (existingRuntime) {
        return existingRuntime;
      }

      const runtime: ChatRuntimeEntry = {
        chatId: input.chatId,
        pendingSubmission: null,
        persistenceStatus: "confirmed",
        projectId: input.projectId,
        requestSpecs: [],
        runtimeId: `chat:${input.chatId}`,
        store: createCustomChatStore(input.initialMessages ?? []),
        submittedMessage: null,
      };

      publishEntries([...entriesRef.current, runtime]);
      return runtime;
    },
    [publishEntries]
  );

  const ensureProvisionalRuntime = useCallback(
    (input: EnsureProvisionalRuntimeInput) => {
      const existingRuntime = entriesRef.current.find(
        (entry) => entry.chatId === input.chatId
      );

      if (existingRuntime) {
        return existingRuntime;
      }

      const runtime: ChatRuntimeEntry = {
        chatId: input.chatId,
        pendingSubmission: null,
        persistenceStatus: "provisional",
        projectId: input.projectId,
        requestSpecs: [],
        runtimeId: `chat:${input.chatId}`,
        store: createCustomChatStore(),
        submittedMessage: null,
      };

      publishEntries([...entriesRef.current, runtime]);
      return runtime;
    },
    [publishEntries]
  );

  const submitProvisionalRuntime = useCallback(
    (input: SubmitProvisionalRuntimeInput) => {
      const runtime = entriesRef.current.find(
        (entry) => entry.chatId === input.chatId
      );

      if (!runtime || runtime.persistenceStatus !== "provisional") {
        return false;
      }

      const nextEntries = entriesRef.current.map((entry) =>
        entry.runtimeId === runtime.runtimeId
          ? {
              ...entry,
              pendingSubmission: input.pendingSubmission,
              projectId: input.projectId,
              requestSpecs: input.requestSpecs,
              submittedMessage: input.pendingSubmission.message,
            }
          : entry
      );
      entriesRef.current = nextEntries;
      setEntries(nextEntries);
      return true;
    },
    []
  );

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

  const markRuntimeConfirmed = useCallback((runtimeId: ChatRuntimeId) => {
    const runtime = entriesRef.current.find(
      (entry) => entry.runtimeId === runtimeId
    );

    if (!runtime || runtime.persistenceStatus === "confirmed") {
      return;
    }

    const nextEntries = entriesRef.current.map((entry) =>
      entry.runtimeId === runtimeId
        ? { ...entry, persistenceStatus: "confirmed" as const }
        : entry
    );
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
  }, []);

  const value = useMemo(
    () => ({
      ensureConfirmedRuntime,
      ensureProvisionalRuntime,
      entries,
      getRuntimeByChatId,
      markRuntimeConfirmed,
      markPendingSubmissionStarted,
      submitProvisionalRuntime,
    }),
    [
      ensureConfirmedRuntime,
      ensureProvisionalRuntime,
      entries,
      getRuntimeByChatId,
      markRuntimeConfirmed,
      markPendingSubmissionStarted,
      submitProvisionalRuntime,
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

function MountedChatRuntime({ runtime }: { runtime: ChatRuntimeEntry }) {
  const { markPendingSubmissionStarted, markRuntimeConfirmed } =
    useChatRuntimeRegistry();

  return (
    <CustomStoreProvider<ChatMessage> store={runtime.store}>
      <RuntimeConfirmationController runtime={runtime} />
      <ChatSync
        id={runtime.chatId}
        onChatConfirmed={() => markRuntimeConfirmed(runtime.runtimeId)}
        onPendingSubmissionStarted={() =>
          markPendingSubmissionStarted(runtime.runtimeId)
        }
        pendingSubmission={runtime.pendingSubmission}
        projectId={runtime.projectId ?? undefined}
      />
    </CustomStoreProvider>
  );
}

function RuntimeConfirmationController({
  runtime,
}: {
  runtime: ChatRuntimeEntry;
}) {
  const addMessageToTree = useAddMessageToTree();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const hasHandledConfirmationRef = useRef(
    runtime.persistenceStatus === "confirmed"
  );

  useEffect(() => {
    if (runtime.persistenceStatus !== "confirmed") {
      return;
    }

    if (hasHandledConfirmationRef.current) {
      return;
    }

    hasHandledConfirmationRef.current = true;

    const invalidatePersistedChatQueries = async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getChatMessages.queryKey({
            chatId: runtime.chatId,
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getChatById.queryKey({
            chatId: runtime.chatId,
          }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.chat.getAllChats.queryKey(),
          exact: false,
        }),
      ]);
    };

    const secondaryRequestSpecs = runtime.requestSpecs.slice(1);

    const submittedMessage = runtime.submittedMessage;

    if (secondaryRequestSpecs.length === 0 || !submittedMessage) {
      invalidatePersistedChatQueries().catch(() => {
        toast.error("Failed to refresh chat history");
      });
      return;
    }

    runParallelRequestSpecs({
      chatId: runtime.chatId,
      message: submittedMessage,
      projectId: runtime.projectId,
      requestSpecs: secondaryRequestSpecs,
    })
      .then((failedRequestSpecs) => {
        if (failedRequestSpecs.length > 0) {
          markParallelRequestSpecsFailed({
            addMessageToTree,
            message: submittedMessage,
            requestSpecs: failedRequestSpecs,
          });
          toast.error("Failed to complete all parallel responses");
        }
      })
      .catch(() => {
        toast.error("Failed to complete all parallel responses");
      })
      .finally(() => {
        invalidatePersistedChatQueries().catch(() => {
          toast.error("Failed to refresh chat history");
        });
      });
  }, [addMessageToTree, queryClient, runtime, trpc]);

  return null;
}

export function MountedChatRuntimes() {
  const { entries } = useChatRuntimeRegistry();

  return (
    <>
      {entries.map((runtime) => (
        <MountedChatRuntime key={runtime.runtimeId} runtime={runtime} />
      ))}
    </>
  );
}
