"use client";

import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type RuntimeId = string;

export interface ChatRuntime<TData = unknown> {
  data: TData;
  runtimeId: RuntimeId;
}

export interface CreateRuntimeInput<TData = unknown> {
  data: TData;
  runtimeId: RuntimeId;
}

interface ChatRuntimeRegistryContextValue<TData = unknown> {
  ensureRuntime: (input: CreateRuntimeInput<TData>) => void;
  getRuntimeById: (
    runtimeId: string | null | undefined
  ) => ChatRuntime<TData> | null;
  runtimes: ChatRuntime<TData>[];
}

const ChatRuntimeRegistryContext =
  createContext<ChatRuntimeRegistryContextValue | null>(null);

function assertValidRuntimeId(runtimeId: RuntimeId): asserts runtimeId {
  if (!runtimeId) {
    throw new Error("Runtime id is required");
  }
}

function createRuntime<TData>(
  input: CreateRuntimeInput<TData>
): ChatRuntime<TData> {
  assertValidRuntimeId(input.runtimeId);

  return {
    data: input.data,
    runtimeId: input.runtimeId,
  };
}

function createInitialRuntimes<TData>(
  initialRuntimes: CreateRuntimeInput<TData>[]
) {
  const runtimes: ChatRuntime<TData>[] = [];
  const seenRuntimeIds = new Set<string>();

  for (const initialRuntime of initialRuntimes) {
    assertValidRuntimeId(initialRuntime.runtimeId);

    if (seenRuntimeIds.has(initialRuntime.runtimeId)) {
      continue;
    }

    seenRuntimeIds.add(initialRuntime.runtimeId);
    runtimes.push(createRuntime(initialRuntime));
  }

  return runtimes;
}

export function ChatRuntimeRegistryProvider<TData = unknown>({
  children,
  initialRuntimes = [],
}: {
  children: ReactNode;
  initialRuntimes?: CreateRuntimeInput<TData>[];
}) {
  const [runtimes, setRuntimes] = useState<ChatRuntime<TData>[]>(() =>
    createInitialRuntimes(initialRuntimes)
  );

  const getRuntimeById = useCallback(
    (runtimeId: string | null | undefined) => {
      if (!runtimeId) {
        return null;
      }

      return (
        runtimes.find((runtime) => runtime.runtimeId === runtimeId) ?? null
      );
    },
    [runtimes]
  );

  const ensureRuntime = useCallback((input: CreateRuntimeInput<TData>) => {
    assertValidRuntimeId(input.runtimeId);

    setRuntimes((currentRuntimes) => {
      if (
        currentRuntimes.some((runtime) => runtime.runtimeId === input.runtimeId)
      ) {
        return currentRuntimes;
      }

      return [...currentRuntimes, createRuntime(input)];
    });
  }, []);

  const value = useMemo(
    () => ({
      ensureRuntime,
      getRuntimeById,
      runtimes,
    }),
    [ensureRuntime, getRuntimeById, runtimes]
  );

  return (
    <ChatRuntimeRegistryContext.Provider
      value={value as ChatRuntimeRegistryContextValue}
    >
      {children}
    </ChatRuntimeRegistryContext.Provider>
  );
}

export function useChatRuntimeRegistry<TData = unknown>() {
  const context = useContext(ChatRuntimeRegistryContext);
  if (!context) {
    throw new Error(
      "useChatRuntimeRegistry must be used within ChatRuntimeRegistryProvider"
    );
  }
  return context as ChatRuntimeRegistryContextValue<TData>;
}

export function MountedChatRuntimes<TData = unknown>({
  children,
}: {
  children: (runtime: ChatRuntime<TData>) => ReactNode;
}) {
  const { runtimes } = useChatRuntimeRegistry<TData>();

  return (
    <>
      {runtimes.map((runtime) => (
        <Fragment key={runtime.runtimeId}>{children(runtime)}</Fragment>
      ))}
    </>
  );
}
