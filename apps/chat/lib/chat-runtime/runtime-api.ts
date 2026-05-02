"use client";

import { useMemo } from "react";
import {
  type CreateRuntimeInput,
  useChatRuntimeRegistry,
} from "./runtime-registry-provider";

export interface ChatRuntimeActions<TData = unknown> {
  ensureRuntime: (input: CreateRuntimeInput<TData>) => void;
}

export function useChatRuntimeActions<
  TData = unknown,
>(): ChatRuntimeActions<TData> {
  const { ensureRuntime } = useChatRuntimeRegistry<TData>();

  return useMemo(
    () => ({
      ensureRuntime,
    }),
    [ensureRuntime]
  );
}

export function useChatRuntime<TData = unknown>(
  runtimeId: string | null | undefined
) {
  const { getRuntimeById } = useChatRuntimeRegistry<TData>();
  return getRuntimeById(runtimeId);
}
