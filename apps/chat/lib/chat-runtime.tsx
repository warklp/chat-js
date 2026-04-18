"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateUUID } from "@/lib/utils";
import {
  type ChatIdType,
  type ParsedChatIdFromPathname,
  parseChatIdFromPathname,
} from "@/providers/parse-chat-id-from-pathname";

interface ChatRuntimeContextValue {
  beginPendingPersistence: (chatId: string) => void;
  confirmPersistence: (chatId: string) => void;
  draftChatId: string;
  pendingPersistenceChatId: string | null;
  resetDraft: () => void;
}

interface CurrentChatValue {
  beginPendingPersistence: (chatId: string) => void;
  confirmChatId: (chatId: string) => void;
  id: string;
  isPendingPersistence: boolean;
  isPersisted: boolean;
  refreshChatID: () => void;
  source: ParsedChatIdFromPathname["source"];
  type: ChatIdType;
}

const ChatRuntimeContext = createContext<ChatRuntimeContextValue | undefined>(
  undefined
);

export function ChatRuntimeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ChatRuntimeContextValue;
}) {
  return (
    <ChatRuntimeContext.Provider value={value}>
      {children}
    </ChatRuntimeContext.Provider>
  );
}

export function ChatRuntimeStateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const skipNextHomeResetRef = useRef(false);
  const [draftChatId, setDraftChatId] = useState(() => generateUUID());
  const [pendingPersistenceChatId, setPendingPersistenceChatId] = useState<
    string | null
  >(null);

  useLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    if (pathname !== "/") {
      return;
    }

    if (skipNextHomeResetRef.current) {
      skipNextHomeResetRef.current = false;
      return;
    }

    if (previousPathname !== "/") {
      setDraftChatId(generateUUID());
      setPendingPersistenceChatId(null);
    }
  }, [pathname]);

  const beginPendingPersistence = useCallback(
    (chatId: string) => {
      if (chatId !== draftChatId) {
        return;
      }

      setPendingPersistenceChatId(chatId);
    },
    [draftChatId]
  );

  const confirmPersistence = useCallback(
    (chatId: string) => {
      if (chatId !== draftChatId) {
        console.error("Chat ID mismatch", chatId, draftChatId);
        throw new Error("Chat ID mismatch");
      }

      setPendingPersistenceChatId(null);
    },
    [draftChatId]
  );

  const resetDraft = useCallback(() => {
    skipNextHomeResetRef.current = true;
    setDraftChatId(generateUUID());
    setPendingPersistenceChatId(null);
  }, []);

  const value = useMemo(
    () => ({
      draftChatId,
      pendingPersistenceChatId,
      beginPendingPersistence,
      confirmPersistence,
      resetDraft,
    }),
    [
      beginPendingPersistence,
      confirmPersistence,
      draftChatId,
      pendingPersistenceChatId,
      resetDraft,
    ]
  );

  return <ChatRuntimeProvider value={value}>{children}</ChatRuntimeProvider>;
}

export function useChatRuntime() {
  const context = useContext(ChatRuntimeContext);

  if (context === undefined) {
    throw new Error("useChatRuntime must be used within a ChatRuntimeProvider");
  }

  return context;
}

export function useCurrentChat(): CurrentChatValue {
  const pathname = usePathname();
  const {
    beginPendingPersistence,
    confirmPersistence,
    draftChatId,
    pendingPersistenceChatId,
    resetDraft,
  } = useChatRuntime();
  const resolvedId = useMemo(
    () => parseChatIdFromPathname(pathname),
    [pathname]
  );

  const id = resolvedId.id ?? draftChatId;
  const isPendingPersistence =
    resolvedId.id !== null && pendingPersistenceChatId === resolvedId.id;
  const isPersisted = resolvedId.id !== null && !isPendingPersistence;

  return useMemo(
    () => ({
      id,
      type: resolvedId.type,
      source: resolvedId.source,
      isPendingPersistence,
      isPersisted,
      beginPendingPersistence,
      confirmChatId: confirmPersistence,
      refreshChatID: resetDraft,
    }),
    [
      beginPendingPersistence,
      confirmPersistence,
      id,
      isPendingPersistence,
      isPersisted,
      resetDraft,
      resolvedId.source,
      resolvedId.type,
    ]
  );
}
