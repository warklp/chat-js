"use client";

import { useQuery } from "@tanstack/react-query";
import {
  notFound,
  redirect,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import type { AppModelId } from "@/lib/ai/app-models";
import {
  type ChatRuntimeApi,
  useChatRuntime,
  useChatRuntimeApi,
} from "@/lib/chat-runtime";
import { useDraftChatId } from "@/lib/draft-chat";
import { useChatModels } from "@/providers/chat-models-provider";
import {
  type ParsedChatIdFromPathname,
  parseChatIdFromPathname,
} from "@/providers/parse-chat-id-from-pathname";
import { useSession } from "@/providers/session-provider";
import { useTRPC } from "@/trpc/react";

interface ChatRouteHostProps {
  children: ReactNode;
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

function getRouteRuntimeKey({
  draftChatId,
  pathname,
  route,
}: {
  draftChatId?: string | null;
  pathname: string;
  route: HostedParsedChatRoute;
}) {
  if (draftChatId && (route.type === "home" || route.type === "projectHome")) {
    return `path:${pathname}:draft:${draftChatId}`;
  }

  return `path:${pathname}`;
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
  chatReady,
  hasLiveRuntime,
  messagesReady,
  persistedRoute,
}: {
  chatReady: boolean;
  hasLiveRuntime: boolean;
  messagesReady: boolean;
  persistedRoute: PersistedChatRoute | null;
}) {
  return !!(persistedRoute && !hasLiveRuntime && !(chatReady && messagesReady));
}

function shouldReturnNotFound({
  chat,
  chatError,
  hasLiveRuntime,
  messagesError,
  persistedRoute,
  project,
  route,
}: {
  chat: { projectId: string | null } | null | undefined;
  chatError: unknown;
  hasLiveRuntime: boolean;
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
    !hasLiveRuntime &&
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

function getRouteProjectId(route: HostedParsedChatRoute) {
  return route.type === "projectHome" || route.type === "projectChat"
    ? route.projectId
    : null;
}

function canCreateRouteRuntime({
  persistedRoute,
  project,
  route,
}: {
  persistedRoute: PersistedChatRoute | null;
  project: unknown;
  route: HostedParsedChatRoute;
}) {
  if (persistedRoute) {
    return false;
  }

  return route.type === "home" || (route.type === "projectHome" && !!project);
}

function resolveRouteRuntime({
  chatId,
  existingRuntime,
  initialMessages,
  persistedChat,
  persistedMessages,
  persistedRoute,
  project,
  route,
  runtimeApi,
}: {
  chatId: string | null;
  existingRuntime: ReturnType<typeof useChatRuntime>;
  initialMessages: ReturnType<
    typeof useChatSystemInitialState
  >["initialMessages"];
  persistedChat: { projectId: string | null } | null | undefined;
  persistedMessages: unknown;
  persistedRoute: PersistedChatRoute | null;
  project: unknown;
  route: HostedParsedChatRoute;
  runtimeApi: ChatRuntimeApi;
}) {
  if (existingRuntime || !chatId) {
    return existingRuntime;
  }

  if (persistedRoute) {
    if (!(persistedChat && Array.isArray(persistedMessages))) {
      return null;
    }

    return runtimeApi.ensureConfirmedRuntime({
      chatId,
      initialMessages,
      projectId: persistedRoute.projectId ?? persistedChat.projectId ?? null,
    });
  }

  if (!canCreateRouteRuntime({ persistedRoute, project, route })) {
    return null;
  }

  return runtimeApi.ensureProvisionalRuntime({
    chatId,
    projectId: getRouteProjectId(route),
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Coordinates route data, persisted state, and live runtime fallback.
function HostedChatRoute({
  pathname,
  route,
}: {
  pathname: string;
  route: HostedParsedChatRoute;
}) {
  const { data: session, isPending: isSessionPending } = useSession();
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const { getModelById } = useChatModels();
  const projectHomeId = getProjectHomeId(route);
  const draftChatId = useDraftChatId(projectHomeId);
  const persistedRoute = getPersistedRoute(route);
  const runtimeChatId = persistedRoute?.id ?? draftChatId;
  const existingRuntime = useChatRuntime(runtimeChatId);
  const persistedChatId = persistedRoute?.id ?? "";
  const hasConfirmedPersistedRoute =
    existingRuntime?.persistenceStatus === "confirmed" || !existingRuntime;
  const shouldLoadPersistedMessages =
    !!persistedRoute && hasConfirmedPersistedRoute;

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

  const persistedInitialState = useChatSystemInitialState(persistedMessages);
  const runtimeApi = useChatRuntimeApi();
  const liveRuntime = resolveRouteRuntime({
    chatId: runtimeChatId,
    existingRuntime,
    initialMessages: persistedInitialState.initialMessages,
    persistedChat,
    persistedMessages,
    persistedRoute,
    project: projectQuery.data,
    route,
    runtimeApi,
  });
  const hasLiveRuntime = !!liveRuntime;
  const liveRuntimeMessages = liveRuntime?.store.getState().messages;
  const initialMessages =
    liveRuntimeMessages ?? persistedInitialState.initialMessages;
  const initialTool = liveRuntime ? null : persistedInitialState.initialTool;
  const syncedMessages = liveRuntime ? undefined : persistedMessages;

  const value = searchParams.get("modelId");
  const overrideModelId = getOverrideModelId({ getModelById, route, value });
  const id = runtimeChatId;
  const baseRuntimeKey = getRouteRuntimeKey({
    draftChatId: persistedRoute ? null : draftChatId,
    pathname,
    route,
  });
  const effectiveRuntimeKey = liveRuntime?.runtimeId ?? baseRuntimeKey;

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
      chatReady: chatQueryReady,
      hasLiveRuntime,
      messagesReady: messagesQueryReady,
      persistedRoute,
    })
  ) {
    return <ChatLoadingShell />;
  }

  if (
    shouldReturnNotFound({
      chat: persistedChat,
      chatError: chatQuery.error,
      hasLiveRuntime,
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

  if (!liveRuntime) {
    return <ChatLoadingShell />;
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
      runtimeKey={effectiveRuntimeKey}
      store={liveRuntime?.store}
      syncedMessages={syncedMessages}
    />
  );
}

export function ChatRouteHost({ children }: ChatRouteHostProps) {
  const pathname = usePathname();
  const route = useMemo(() => parseChatIdFromPathname(pathname), [pathname]);

  const hosted =
    route.type === "home" ||
    route.type === "projectHome" ||
    route.type === "chat" ||
    route.type === "projectChat";

  return hosted ? (
    <HostedChatRoute pathname={pathname} route={route} />
  ) : (
    children
  );
}
