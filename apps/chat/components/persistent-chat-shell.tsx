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
  useProject,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import type { AppModelId } from "@/lib/ai/app-models";
import { useCurrentChat } from "@/lib/chat-runtime";
import { parseChatIdFromPathname } from "@/providers/parse-chat-id-from-pathname";
import { useSession } from "@/providers/session-provider";

function PersistentChatRuntime() {
  const { data: session, isPending } = useSession();
  const { id, isPendingPersistence } = useCurrentChat();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const committedChatIdRef = useRef<string | null>(null);
  const route = useMemo(() => parseChatIdFromPathname(pathname), [pathname]);
  const isHomeRoute = pathname === "/";
  const isProjectRoute = route.source === "project";
  const isPersistedChatRoute =
    route.type === "chat" &&
    (route.source === "chat" || route.source === "project");
  const shouldBootstrapPersistedChat =
    isPersistedChatRoute &&
    !isPendingPersistence &&
    committedChatIdRef.current !== id;
  const overrideModelId = useMemo(() => {
    const value = searchParams.get("modelId");
    return (value as AppModelId) || undefined;
  }, [searchParams]);
  const { data: project, isPending: isProjectPending } = useProject(
    route.projectId,
    { enabled: isProjectRoute }
  );

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
    : isHomeRoute || isProjectRoute
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

    if (isProjectRoute) {
      if (isProjectPending) {
        return null;
      }

      if (!project) {
        return notFound();
      }
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
          projectId={route.projectId ?? undefined}
        />
      );
    }

    return (
      <ChatSystem
        id={id}
        initialMessages={[]}
        isReadonly={false}
        projectId={route.projectId ?? undefined}
      />
    );
  }

  if (isProjectRoute) {
    if (!(isPending || session?.user)) {
      return redirect("/");
    }

    if (!session?.user || isProjectPending) {
      return null;
    }

    if (!project) {
      return notFound();
    }

    return (
      <ChatSystem
        id={id}
        initialMessages={[]}
        isReadonly={false}
        projectId={project.id}
      />
    );
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

export function PersistentChatShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PersistentChatRuntime />
      {children}
    </>
  );
}
