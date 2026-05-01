"use client";

import { useMemo } from "react";
import {
  type ChatRuntimeEntry,
  type CreateRuntimeInput,
  useChatRuntimeRegistry,
} from "./runtime-registry-provider";

export interface ChatRuntimeActions {
  createRuntimeIfMissing: (input: CreateRuntimeInput) => ChatRuntimeEntry;
}

export function useChatRuntimeActions(): ChatRuntimeActions {
  const { createRuntimeIfMissing } = useChatRuntimeRegistry();

  return useMemo(
    () => ({
      createRuntimeIfMissing,
    }),
    [createRuntimeIfMissing]
  );
}

export function useChatRuntime(runtimeId: string | null | undefined) {
  const { getRuntimeById } = useChatRuntimeRegistry();
  return getRuntimeById(runtimeId);
}
