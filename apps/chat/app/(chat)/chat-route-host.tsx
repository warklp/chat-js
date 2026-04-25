"use client";

import { useQuery } from "@tanstack/react-query";
import {
  notFound,
  redirect,
  usePathname,
  useSearchParams,
} from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import type { AppModelId } from "@/lib/ai/app-models";
import type { ChatMessage } from "@/lib/ai/types";
import {
  getBaseChatRuntimeKey,
  getChatRuntimeKey,
  type InitialChatTransition,
  isTransitionRouteMismatch,
} from "@/lib/chat-runtime-transition";
import { resetDraftChatId, useDraftChatId } from "@/lib/draft-chat";
import { createPendingAssistantMessage } from "@/lib/parallel-chat-requests";
import { useChatModels } from "@/providers/chat-models-provider";
import {
  ChatRuntimeTransitionProvider,
  type StartInitialChatTransitionInput,
} from "@/providers/chat-runtime-transition-provider";
import {
  type ParsedChatIdFromPathname,
  parseChatIdFromPathname,
} from "@/providers/parse-chat-id-from-pathname";
import { useSession } from "@/providers/session-provider";
import { useTRPC } from "@/trpc/react";

interface ChatRouteHostProps {
  children: ReactNode;
}

function useRoutePathname() {
  return usePathname() ?? "/";
}

function ChatLoadingShell() {
  return <div className="h-dvh w-full bg-background" />;
}

type HostedParsedChatRoute = Extract<
  ParsedChatIdFromPathname,
  { type: "chat" | "home" | "projectChat" | "projectHome" }
>;

type PersistedChatRoute = Extract<
  ParsedChatIdFromPathname,
  { type: "chat" | "projectChat" }
>;

function getPersistedRoute(route: HostedParsedChatRoute) {
  return route.type === "chat" || route.type === "projectChat" ? route : null;
}

function getProjectHomeId(route: HostedParsedChatRoute) {
  return route.type === "projectHome" ? route.projectId : null;
}

function getActiveTransition({
  pathname,
  persistedRoute,
  transition,
}: {
  pathname: string;
  persistedRoute: PersistedChatRoute | null;
  transition: InitialChatTransition | null;
}) {
  return persistedRoute &&
    transition?.chatId === persistedRoute.id &&
    pathname === transition.toPath
    ? transition
    : null;
}

function getTransitionMessages(transition: InitialChatTransition | null) {
  if (!transition) {
    return [];
  }

  return [
    transition.message,
    ...transition.requestSpecs.map((requestSpec) =>
      createPendingAssistantMessage({
        activeStreamId: `pending:${requestSpec.assistantMessageId}`,
        message: transition.message,
        requestSpec,
      })
    ),
  ];
}

function getProjectIdForChatSystem({
  persistedRoute,
  projectId,
  route,
}: {
  persistedRoute: PersistedChatRoute | null;
  projectId?: string;
  route: HostedParsedChatRoute;
}) {
  if (route.type === "projectHome") {
    return projectId;
  }

  return persistedRoute?.projectId ?? undefined;
}

function getActiveChatTransition({
  activeTransition,
  id,
  transition,
}: {
  activeTransition: InitialChatTransition | null;
  id: string | null;
  transition: InitialChatTransition | null;
}) {
  return activeTransition ?? (transition?.chatId === id ? transition : null);
}

function shouldShowSessionLoading({
  isSessionPending,
  route,
}: {
  isSessionPending: boolean;
  route: HostedParsedChatRoute;
}) {
  return isSessionPending && route.type !== "home";
}

function shouldRedirectForAuth({
  hasUser,
  route,
}: {
  hasUser: boolean;
  route: HostedParsedChatRoute;
}) {
  return route.type !== "home" && !hasUser;
}

function shouldShowProjectLoading({
  isProjectPending,
  route,
}: {
  isProjectPending: boolean;
  route: HostedParsedChatRoute;
}) {
  return route.type === "projectHome" && isProjectPending;
}

function shouldShowPersistedLoading({
  activeTransition,
  chatReady,
  messagesReady,
  persistedRoute,
}: {
  activeTransition: InitialChatTransition | null;
  chatReady: boolean;
  messagesReady: boolean;
  persistedRoute: PersistedChatRoute | null;
}) {
  return !!(
    persistedRoute &&
    !activeTransition &&
    !(chatReady && messagesReady)
  );
}

function shouldReturnNotFound({
  activeTransition,
  chat,
  chatError,
  messagesError,
  persistedRoute,
  project,
  route,
}: {
  activeTransition: InitialChatTransition | null;
  chat: { projectId: string | null } | null | undefined;
  chatError: unknown;
  messagesError: unknown;
  persistedRoute: PersistedChatRoute | null;
  project: unknown;
  route: HostedParsedChatRoute;
}) {
  if (route.type === "projectHome" && !project) {
    return true;
  }

  if (
    persistedRoute &&
    !activeTransition &&
    (chatError || messagesError || !chat)
  ) {
    return true;
  }

  return !!(
    persistedRoute?.type === "projectChat" &&
    chat &&
    chat.projectId !== persistedRoute.projectId
  );
}

function getInitialMessagesForRuntime({
  activeTransition,
  persistedMessages,
  persistedInitialMessages,
  transitionMessages,
}: {
  activeTransition: InitialChatTransition | null;
  persistedMessages: ChatMessage[] | undefined;
  persistedInitialMessages: ChatMessage[];
  transitionMessages: ChatMessage[];
}) {
  return activeTransition && !persistedMessages
    ? transitionMessages
    : persistedInitialMessages;
}

function getInitialToolForRuntime({
  activeTransition,
  persistedInitialTool,
}: {
  activeTransition: InitialChatTransition | null;
  persistedInitialTool: ReturnType<
    typeof useChatSystemInitialState
  >["initialTool"];
}) {
  return activeTransition ? null : persistedInitialTool;
}

function getSyncedMessagesForRuntime({
  activeTransition,
  persistedMessages,
  transitionMessages,
}: {
  activeTransition: InitialChatTransition | null;
  persistedMessages: ChatMessage[] | undefined;
  transitionMessages: ChatMessage[];
}) {
  return persistedMessages ?? (activeTransition ? transitionMessages : null);
}

const PERSISTED_CHAT_ROUTE_QUERY_OPTIONS = {
  gcTime: 0,
  refetchOnMount: "always" as const,
  refetchOnReconnect: "always" as const,
  refetchOnWindowFocus: "always" as const,
  staleTime: 0,
};

function getFreshRouteQueryData<TData>({
  data,
  isFetchedAfterMount,
}: {
  data: TData | undefined;
  isFetchedAfterMount: boolean;
}) {
  return isFetchedAfterMount ? data : undefined;
}

function isFreshRouteQueryReady({
  error,
  isFetchedAfterMount,
}: {
  error: unknown;
  isFetchedAfterMount: boolean;
}) {
  return isFetchedAfterMount || !!error;
}

function getOverrideModelId({
  getModelById,
  route,
  value,
}: {
  getModelById: ReturnType<typeof useChatModels>["getModelById"];
  route: HostedParsedChatRoute;
  value: string | null;
}) {
  return route.type === "home" && value && getModelById(value)
    ? (value as AppModelId)
    : undefined;
}

function HostedChatRoute({
  pathname,
  route,
  transition,
}: {
  pathname: string;
  route: HostedParsedChatRoute;
  transition: InitialChatTransition | null;
}) {
  const { data: session, isPending: isSessionPending } = useSession();
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const { getModelById } = useChatModels();
  const projectHomeId = getProjectHomeId(route);
  const draftChatId = useDraftChatId(projectHomeId);
  const persistedRoute = getPersistedRoute(route);
  const activeTransition = getActiveTransition({
    pathname,
    persistedRoute,
    transition,
  });
  const persistedChatId = persistedRoute?.id ?? "";
  const shouldLoadPersistedMessages = !!persistedRoute;

  const projectQuery = useQuery({
    ...trpc.project.getById.queryOptions({ id: projectHomeId ?? "" }),
    enabled: route.type === "projectHome" && !!session?.user,
  });

  const chatQueryOptions = useGetChatByIdQueryOptions(persistedChatId);
  const messagesQueryOptions = useGetChatMessagesQueryOptions(persistedChatId);
  const chatQuery = useQuery({
    ...chatQueryOptions,
    ...PERSISTED_CHAT_ROUTE_QUERY_OPTIONS,
    enabled: shouldLoadPersistedMessages && (chatQueryOptions.enabled ?? true),
  });
  const messagesQuery = useQuery({
    ...messagesQueryOptions,
    ...PERSISTED_CHAT_ROUTE_QUERY_OPTIONS,
    enabled:
      shouldLoadPersistedMessages && (messagesQueryOptions.enabled ?? true),
  });

  const chatQueryReady =
    !shouldLoadPersistedMessages ||
    isFreshRouteQueryReady({
      error: chatQuery.error,
      isFetchedAfterMount: chatQuery.isFetchedAfterMount,
    });
  const messagesQueryReady =
    !shouldLoadPersistedMessages ||
    isFreshRouteQueryReady({
      error: messagesQuery.error,
      isFetchedAfterMount: messagesQuery.isFetchedAfterMount,
    });
  const persistedChat = getFreshRouteQueryData({
    data: chatQuery.data,
    isFetchedAfterMount: chatQuery.isFetchedAfterMount,
  });
  const persistedMessages = getFreshRouteQueryData({
    data: messagesQuery.data,
    isFetchedAfterMount: messagesQuery.isFetchedAfterMount,
  });

  const transitionMessages = useMemo(
    () => getTransitionMessages(activeTransition),
    [activeTransition]
  );
  const persistedInitialState = useChatSystemInitialState(persistedMessages);
  const initialMessages = getInitialMessagesForRuntime({
    activeTransition,
    persistedMessages,
    persistedInitialMessages: persistedInitialState.initialMessages,
    transitionMessages,
  });
  const initialTool = getInitialToolForRuntime({
    activeTransition,
    persistedInitialTool: persistedInitialState.initialTool,
  });
  const syncedMessages = getSyncedMessagesForRuntime({
    activeTransition,
    persistedMessages,
    transitionMessages,
  });

  const value = searchParams.get("modelId");
  const overrideModelId = getOverrideModelId({ getModelById, route, value });
  const id = persistedRoute?.id ?? draftChatId;
  const baseRuntimeKey = getBaseChatRuntimeKey({
    draftChatId: persistedRoute ? null : draftChatId,
    pathname,
    route,
  });
  const runtimeKey = getChatRuntimeKey({
    baseRuntimeKey,
    pathname,
    transition,
  });

  if (shouldShowSessionLoading({ isSessionPending, route })) {
    return null;
  }

  if (shouldRedirectForAuth({ hasUser: !!session?.user, route })) {
    redirect("/");
  }

  if (
    shouldShowProjectLoading({
      isProjectPending: projectQuery.isPending,
      route,
    })
  ) {
    return null;
  }

  if (
    shouldShowPersistedLoading({
      activeTransition,
      chatReady: chatQueryReady,
      messagesReady: messagesQueryReady,
      persistedRoute,
    })
  ) {
    return <ChatLoadingShell />;
  }

  if (
    shouldReturnNotFound({
      activeTransition,
      chat: persistedChat,
      chatError: chatQuery.error,
      messagesError: messagesQuery.error,
      persistedRoute,
      project: projectQuery.data,
      route,
    })
  ) {
    return notFound();
  }

  if (!id) {
    return null;
  }

  return (
    <ChatSystem
      chat={persistedChat ?? null}
      id={id}
      initialMessages={initialMessages}
      initialTool={initialTool}
      isReadonly={false}
      overrideModelId={overrideModelId}
      projectId={getProjectIdForChatSystem({
        persistedRoute,
        projectId: projectQuery.data?.id,
        route,
      })}
      routeSource={route.source}
      runtimeKey={runtimeKey}
      syncedMessages={syncedMessages}
      transition={getActiveChatTransition({
        activeTransition,
        id,
        transition,
      })}
    />
  );
}

export function ChatRouteHost({ children }: ChatRouteHostProps) {
  const pathname = useRoutePathname();
  const route = useMemo(() => parseChatIdFromPathname(pathname), [pathname]);
  const [transition, setTransition] = useState<InitialChatTransition | null>(
    null
  );
  const transitionRef = useRef<InitialChatTransition | null>(null);

  useEffect(() => {
    if (!transition) {
      return;
    }

    if (pathname !== transition.fromPath && !transition.draftReset) {
      resetDraftChatId(transition.projectId);
      setTransition((current) => {
        const next =
          current?.chatId === transition.chatId
            ? { ...current, draftReset: true }
            : current;
        transitionRef.current = next;
        return next;
      });
      return;
    }

    if (isTransitionRouteMismatch({ pathname, transition })) {
      transitionRef.current = null;
      setTransition(null);
    }
  }, [pathname, transition]);

  const startInitialTransition = useCallback(
    (input: StartInitialChatTransitionInput) => {
      if (transitionRef.current) {
        return false;
      }

      const nextTransition: InitialChatTransition = {
        ...input,
        draftReset: false,
        fromPath: pathname,
        phase: "submitted",
      };

      transitionRef.current = nextTransition;
      setTransition(nextTransition);

      return true;
    },
    [pathname]
  );

  const markTransitionPhase = useCallback(
    (chatId: string, phase: InitialChatTransition["phase"]) => {
      setTransition((current) => {
        const next =
          current?.chatId === chatId ? { ...current, phase } : current;
        transitionRef.current = next;
        return next;
      });
    },
    []
  );

  const settleTransition = useCallback((chatId: string) => {
    setTransition((current) => {
      const next = current?.chatId === chatId ? null : current;
      transitionRef.current = next;
      return next;
    });
  }, []);

  const hosted =
    route.type === "home" ||
    route.type === "projectHome" ||
    route.type === "chat" ||
    route.type === "projectChat";

  return (
    <ChatRuntimeTransitionProvider
      markTransitionPhase={markTransitionPhase}
      settleTransition={settleTransition}
      startInitialTransition={startInitialTransition}
      transition={transition}
    >
      {hosted ? (
        <HostedChatRoute
          pathname={pathname}
          route={route}
          transition={transition}
        />
      ) : (
        children
      )}
    </ChatRuntimeTransitionProvider>
  );
}
