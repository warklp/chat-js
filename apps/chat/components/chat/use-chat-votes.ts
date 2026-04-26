"use client";

import { useQuery } from "@tanstack/react-query";
import { useChatId } from "@/lib/stores/base";
import { useMessageIds } from "@/lib/stores/hooks-base";
import { useSession } from "@/providers/session-provider";
import { useTRPC } from "@/trpc/react";

export function useChatVotes(
  chatId: string,
  { isReadonly }: { isReadonly: boolean }
) {
  const trpc = useTRPC();
  const { data: session } = useSession();
  const isLoading = chatId !== useChatId();
  const messageIds = useMessageIds() as string[];

  return useQuery({
    ...trpc.vote.getVotes.queryOptions({ chatId }),
    enabled:
      messageIds.length >= 2 && !isReadonly && !!session?.user && !isLoading,
  });
}
