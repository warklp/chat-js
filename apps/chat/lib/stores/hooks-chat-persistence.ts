// Hooks enabled by the with-chat-persistence middleware.

import { useEffect, useState } from "react";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { ChatRuntimeEntry } from "@/lib/chat-runtime";
import {
  type CustomChatStoreState,
  useCustomChatStoreApi,
} from "./custom-store-provider";

function useChatPersistenceStore<T>(
  selector: (store: CustomChatStoreState) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const store = useCustomChatStoreApi();
  if (!store) {
    throw new Error(
      "useChatPersistenceStore must be used within CustomStoreProvider"
    );
  }
  return useStoreWithEqualityFn(store, selector, equalityFn);
}

export function useIsChatPersisted(_chatId?: string) {
  return useChatPersistenceStore((state) => state.isChatPersisted);
}

export function useChatPersistenceActions() {
  return useChatPersistenceStore(
    (state) => ({
      clearPendingChatConfirmation: state.clearPendingChatConfirmation,
      setChatPersisted: state.setChatPersisted,
      setPendingChatConfirmation: state.setPendingChatConfirmation,
    }),
    shallow
  );
}

export function usePendingChatConfirmation() {
  return useChatPersistenceStore((state) => state.pendingChatConfirmation);
}

export function useRuntimeIsChatPersisted(
  runtime: ChatRuntimeEntry | null | undefined
) {
  const [isPersisted, setIsPersisted] = useState(
    () => runtime?.store.getState().isChatPersisted ?? true
  );

  useEffect(() => {
    if (!runtime) {
      setIsPersisted(true);
      return;
    }

    setIsPersisted(runtime.store.getState().isChatPersisted);
    return runtime.store.subscribe(
      (state) => state.isChatPersisted,
      setIsPersisted
    );
  }, [runtime]);

  return isPersisted;
}
