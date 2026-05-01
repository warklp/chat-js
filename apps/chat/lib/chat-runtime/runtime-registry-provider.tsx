"use client";

import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type RuntimeId = string;

interface ChatRuntimeRegistryContextValue {
  ensureRuntime: (runtimeId: RuntimeId) => RuntimeId;
  hasRuntime: (runtimeId: string | null | undefined) => boolean;
  runtimeIds: RuntimeId[];
}

const ChatRuntimeRegistryContext =
  createContext<ChatRuntimeRegistryContextValue | null>(null);

function assertValidRuntimeId(runtimeId: RuntimeId): asserts runtimeId {
  if (!runtimeId) {
    throw new Error("Runtime id is required");
  }
}

function createInitialRuntimeIds(initialRuntimeIds: RuntimeId[]) {
  const runtimeIds: RuntimeId[] = [];
  const seenRuntimeIds = new Set<string>();

  for (const runtimeId of initialRuntimeIds) {
    assertValidRuntimeId(runtimeId);

    if (seenRuntimeIds.has(runtimeId)) {
      continue;
    }

    seenRuntimeIds.add(runtimeId);
    runtimeIds.push(runtimeId);
  }

  return runtimeIds;
}

export function ChatRuntimeRegistryProvider({
  children,
  initialRuntimeIds = [],
}: {
  children: ReactNode;
  initialRuntimeIds?: RuntimeId[];
}) {
  const [runtimeIds, setRuntimeIds] = useState<RuntimeId[]>(() =>
    createInitialRuntimeIds(initialRuntimeIds)
  );
  const runtimeIdsRef = useRef<RuntimeId[]>(runtimeIds);

  const hasRuntime = useCallback(
    (runtimeId: string | null | undefined) =>
      runtimeId ? runtimeIdsRef.current.includes(runtimeId) : false,
    []
  );

  const ensureRuntime = useCallback((runtimeId: RuntimeId) => {
    assertValidRuntimeId(runtimeId);

    if (runtimeIdsRef.current.includes(runtimeId)) {
      return runtimeId;
    }

    const nextRuntimeIds = [...runtimeIdsRef.current, runtimeId];

    runtimeIdsRef.current = nextRuntimeIds;
    setRuntimeIds(nextRuntimeIds);
    return runtimeId;
  }, []);

  const value = useMemo(
    () => ({
      ensureRuntime,
      hasRuntime,
      runtimeIds,
    }),
    [ensureRuntime, hasRuntime, runtimeIds]
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

export function MountedChatRuntimes({
  children,
}: {
  children: (runtimeId: RuntimeId) => ReactNode;
}) {
  const { runtimeIds } = useChatRuntimeRegistry();

  return (
    <>
      {runtimeIds.map((runtimeId) => (
        <Fragment key={runtimeId}>{children(runtimeId)}</Fragment>
      ))}
    </>
  );
}
