"use client";

import { useQuery } from "@tanstack/react-query";
import {
  notFound,
  redirect,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import type { AppModelId } from "@/lib/ai/app-models";
import {
  type CreateRuntimeInput,
  useChatRuntime,
  useChatRuntimeActions,
} from "@/lib/chat-runtime";
import { useDraftChatId } from "@/lib/draft-chat";
import {
  type CreateChatRuntimeStoreInput,
  useChatRuntimeStore,
  useChatRuntimeStoreActions,
} from "@/lib/stores/chat-runtime-store-registry";
import { useRuntimeIsChatPersisted } from "@/lib/stores/hooks-chat-persistence";
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

interface RouteRuntimeCreationRequest {
  markPersisted: boolean;
  runtimeInput: CreateRuntimeInput;
  storeInput: CreateChatRuntimeStoreInput;
}

function getRouteRuntimeCreationRequest({
  chatId,
  existingRuntime,
  existingStore,
  initialMessages,
  persistedChat,
  persistedMessages,
  persistedRoute,
  project,
  route,
}: {
  chatId: string | null;
  existingRuntime: ReturnType<typeof useChatRuntime>;
  existingStore: ReturnType<typeof useChatRuntimeStore>;
  initialMessages: ReturnType<
    typeof useChatSystemInitialState
  >["initialMessages"];
  persistedChat: { projectId: string | null } | null | undefined;
  persistedMessages: unknown;
  persistedRoute: PersistedChatRoute | null;
  project: unknown;
  route: HostedParsedChatRoute;
}): RouteRuntimeCreationRequest | null {
  if ((existingRuntime && existingStore) || !chatId) {
    return null;
  }

  if (persistedRoute) {
    if (!(persistedChat && Array.isArray(persistedMessages))) {
      return null;
    }

    return {
      runtimeInput: {
        chatId,
      },
      storeInput: {
        chatId,
        initialMessages,
      },
      markPersisted: true,
    };
  }

  if (!canCreateRouteRuntime({ persistedRoute, project, route })) {
    return null;
  }

  return {
    runtimeInput: {
      chatId,
    },
    storeInput: {
      chatId,
    },
    markPersisted: false,
  };
}

function useEnsureRouteRuntimeAfterCommit(
  request: RouteRuntimeCreationRequest | null
) {
  const { createRuntimeIfMissing } = useChatRuntimeActions();
  const { createStoreIfMissing } = useChatRuntimeStoreActions();

  useEffect(() => {
    if (!request) {
      return;
    }

    const store = createStoreIfMissing(request.storeInput);
    createRuntimeIfMissing(request.runtimeInput);

    if (request.markPersisted && !store.getState().isChatPersisted) {
      store.getState().setChatPersisted(true);
    }
  }, [createRuntimeIfMissing, createStoreIfMissing, request]);
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
  const existingStore = useChatRuntimeStore(runtimeChatId);
  const isExistingRuntimePersisted = useRuntimeIsChatPersisted(existingStore);
  const persistedChatId = persistedRoute?.id ?? "";
  const shouldLoadPersistedMessages =
    !!persistedRoute && isExistingRuntimePersisted;

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
  const runtimeCreationRequest = useMemo(
    () =>
      getRouteRuntimeCreationRequest({
        chatId: runtimeChatId,
        existingRuntime,
        existingStore,
        initialMessages: persistedInitialState.initialMessages,
        persistedChat,
        persistedMessages,
        persistedRoute,
        project: projectQuery.data,
        route,
      }),
    [
      existingRuntime,
      existingStore,
      persistedChat,
      persistedInitialState.initialMessages,
      persistedMessages,
      persistedRoute,
      projectQuery.data,
      route,
      runtimeChatId,
    ]
  );
  useEnsureRouteRuntimeAfterCommit(runtimeCreationRequest);
  const liveRuntime = existingRuntime;
  const liveStore = existingStore;
  const hasLiveRuntime = !!(liveRuntime && liveStore);
  const liveRuntimeMessages = liveStore?.getState().messages;
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

  if (!(liveRuntime && liveStore)) {
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
      store={liveStore}
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
