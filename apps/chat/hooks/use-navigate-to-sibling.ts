import { useCallback } from "react";
import { useArtifact } from "@/hooks/use-artifact";
import type { ChatMessage } from "@/lib/ai/types";
import { useChatActions } from "@/lib/stores/base";
import { useCustomChatStoreApi } from "@/lib/stores/custom-store-provider";
import { useDataStream } from "@/lib/stores/hooks-data-stream";
import { useSwitchToSibling } from "@/lib/stores/hooks-threads";
import { summarizeThreadMessages, traceThread } from "@/lib/thread-debug";

/**
 * Navigate to a sibling thread while preserving branch-owned active runs.
 * Uses the store's switchToSibling for the pure state transition.
 */
export function useNavigateToSibling() {
  const { setMessages } = useChatActions<ChatMessage>();
  const { setDataStream } = useDataStream();
  const { artifact, closeArtifact } = useArtifact();
  const switchToSibling = useSwitchToSibling();
  const storeApi = useCustomChatStoreApi<ChatMessage>();

  return useCallback(
    (messageId: string, direction: "prev" | "next") => {
      const before = storeApi.getState();
      traceThread("navigation", "navigateToSibling.begin", {
        direction,
        messageId,
        status: before.status,
        threadEpoch: before.threadEpoch,
        visible: summarizeThreadMessages(before.messages),
      });

      traceThread("navigation", "navigateToSibling.preserveRuns", {
        direction,
        messageId,
      });
      // Data parts belong to the previously selected path. Active runs remain
      // owned by the thread runtime and continue updating their tree nodes.
      setDataStream([]);

      const newThread = switchToSibling(messageId, direction);
      if (newThread) {
        setMessages(newThread);
        traceThread("navigation", "navigateToSibling.runtimeSynchronized", {
          direction,
          messageId,
          visible: summarizeThreadMessages(newThread),
        });
      }
      const after = storeApi.getState();
      traceThread("navigation", "navigateToSibling.finish", {
        direction,
        messageId,
        status: after.status,
        threadEpoch: after.threadEpoch,
        visible: summarizeThreadMessages(after.messages),
      });

      // Close artifact if its message is not in the new thread
      if (
        newThread &&
        artifact.isVisible &&
        artifact.messageId &&
        !newThread.some(
          (message: ChatMessage) => message.id === artifact.messageId
        )
      ) {
        closeArtifact();
      }
    },
    [
      artifact.isVisible,
      artifact.messageId,
      closeArtifact,
      setDataStream,
      setMessages,
      storeApi,
      switchToSibling,
    ]
  );
}
