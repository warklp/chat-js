"use client";

import { useMemo } from "react";
import {
  type RuntimeId,
  useChatRuntimeRegistry,
} from "./runtime-registry-provider";

export interface ChatRuntimeActions {
  ensureRuntime: (runtimeId: RuntimeId) => RuntimeId;
}

export function useChatRuntimeActions(): ChatRuntimeActions {
  const { ensureRuntime } = useChatRuntimeRegistry();

  return useMemo(
    () => ({
      ensureRuntime,
    }),
    [ensureRuntime]
  );
}

export function useChatRuntime(runtimeId: string | null | undefined) {
  const { hasRuntime } = useChatRuntimeRegistry();
  return hasRuntime(runtimeId) ? runtimeId : null;
}
