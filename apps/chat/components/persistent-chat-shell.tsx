"use client";

import { useQuery } from "@tanstack/react-query";
import {
  notFound,
  redirect,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import type { AppModelId } from "@/lib/ai/app-models";
import { useChatId } from "@/providers/chat-id-provider";
import { useSession } from "@/providers/session-provider";

export function PersistentChatShell() {
  const { data: session, isPending } = useSession();
  const { id, isPendingPersistence, source } = useChatId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const committedChatIdRef = useRef<string | null>(null);
  const isHomeRoute = pathname === "/";
  const isPersistedChatRoute = source === "chat";
  const shouldBootstrapPersistedChat =
    isPersistedChatRoute &&
    !isPendingPersistence &&
    committedChatIdRef.current !== id;
  const overrideModelId = useMemo(() => {
    const value = searchParams.get("modelId");
    return (value as AppModelId) || undefined;
  }, [searchParams]);

  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(id);
  const { data: chat, isPending: isChatPending } = useQuery({
    ...getChatByIdQueryOptions,
    enabled:
      shouldBootstrapPersistedChat &&
      !isPending &&
      !!session?.user &&
      (getChatByIdQueryOptions.enabled ?? true),
  });
  const getMessagesByChatIdQueryOptions = useGetChatMessagesQueryOptions();
  const { data: messages, isPending: areMessagesPending } = useQuery({
    ...getMessagesByChatIdQueryOptions,
    enabled:
      shouldBootstrapPersistedChat &&
      !isPending &&
      !!session?.user &&
      (getMessagesByChatIdQueryOptions.enabled ?? true),
  });

  const { initialMessages, initialTool } = useChatSystemInitialState(messages);
  const renderedRuntimeId = isPersistedChatRoute
    ? shouldBootstrapPersistedChat
      ? (chat?.id ?? null)
      : id
    : isHomeRoute
      ? id
      : null;

  useEffect(() => {
    if (renderedRuntimeId) {
      committedChatIdRef.current = renderedRuntimeId;
    }
  }, [renderedRuntimeId]);

  if (isPersistedChatRoute) {
    if (!(isPending || session?.user)) {
      return redirect("/");
    }

    if (!session?.user) {
      return null;
    }

    if (shouldBootstrapPersistedChat) {
      if (isChatPending || areMessagesPending) {
        return null;
      }

      if (!chat) {
        return notFound();
      }

      return (
        <ChatSystem
          id={chat.id}
          initialMessages={initialMessages}
          initialTool={initialTool}
          isReadonly={false}
        />
      );
    }

    return <ChatSystem id={id} initialMessages={[]} isReadonly={false} />;
  }

  if (!isHomeRoute) {
    return null;
  }

  return (
    <ChatSystem
      id={id}
      initialMessages={[]}
      isReadonly={false}
      overrideModelId={overrideModelId}
    />
  );
}
