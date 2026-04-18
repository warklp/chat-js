"use client";

import { usePathname, useRouter } from "next/navigation";
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
import { useSession } from "@/providers/session-provider";
import {
  type ChatIdType,
  type ParsedChatIdFromPathname,
  parseChatIdFromPathname,
} from "./parse-chat-id-from-pathname";

interface ChatIdContextType {
  beginPendingPersistence: (chatId: string) => void;
  confirmChatId: (chatId: string) => void;
  id: string;
  isPendingPersistence: boolean;
  isPersisted: boolean;
  refreshChatID: () => void;
  source: ParsedChatIdFromPathname["source"];
  type: ChatIdType;
}

const ChatIdContext = createContext<ChatIdContextType | undefined>(undefined);

export function ChatIdProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [
    { provisionalChatId, confirmedChatId, pendingPersistenceChatId },
    setChatIdState,
  ] = useState<{
    provisionalChatId: string;
    confirmedChatId: string | null;
    pendingPersistenceChatId: string | null;
  }>(() => ({
    provisionalChatId: generateUUID(),
    confirmedChatId: null,
    pendingPersistenceChatId: null,
  }));
  const previousPathnameRef = useRef(pathname);
  const skipNextHomeResetRef = useRef(false);

  const resolvedId = useMemo(
    () => parseChatIdFromPathname(pathname),
    [pathname]
  );

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
      setChatIdState({
        provisionalChatId: generateUUID(),
        confirmedChatId: null,
        pendingPersistenceChatId: null,
      });
    }
  }, [pathname]);

  const beginPendingPersistence = useCallback(
    (chatId: string) => {
      if (chatId !== provisionalChatId) {
        return;
      }

      setChatIdState((prev) => ({
        ...prev,
        pendingPersistenceChatId: chatId,
      }));
    },
    [provisionalChatId]
  );

  const confirmChatIdPersisted = useCallback(
    (chatId: string) => {
      if (chatId !== provisionalChatId) {
        console.error("Chat ID mismatch", chatId, provisionalChatId);
        throw new Error("Chat ID mismatch");
      }
      setChatIdState((prev) => ({
        ...prev,
        confirmedChatId: chatId,
        pendingPersistenceChatId: null,
      }));
    },
    [provisionalChatId]
  );

  const refreshChatID = useCallback(() => {
    const newId = generateUUID();
    setChatIdState({
      provisionalChatId: newId,
      confirmedChatId: null,
      pendingPersistenceChatId: null,
    });
    skipNextHomeResetRef.current = true;

    if (session?.user) {
      router.push("/");
      return;
    }

    if (pathname !== "/") {
      router.push("/");
    }
  }, [pathname, router, session?.user]);

  const value = useMemo(
    () => ({
      id: resolvedId.id ?? provisionalChatId,
      type: resolvedId.type,
      source: resolvedId.source,
      isPendingPersistence: pendingPersistenceChatId === resolvedId.id,
      isPersisted:
        resolvedId.source !== "home" &&
        ((resolvedId.id !== null && resolvedId.id !== provisionalChatId) ||
          confirmedChatId === provisionalChatId),
      beginPendingPersistence,
      confirmChatId: confirmChatIdPersisted,
      refreshChatID,
    }),
    [
      resolvedId.id,
      resolvedId.type,
      resolvedId.source,
      provisionalChatId,
      confirmedChatId,
      pendingPersistenceChatId,
      beginPendingPersistence,
      confirmChatIdPersisted,
      refreshChatID,
    ]
  );

  return (
    <ChatIdContext.Provider value={value}>{children}</ChatIdContext.Provider>
  );
}

export function useChatId() {
  const context = useContext(ChatIdContext);
  if (context === undefined) {
    throw new Error("useChatId must be used within a ChatIdProvider");
  }
  return context;
}
