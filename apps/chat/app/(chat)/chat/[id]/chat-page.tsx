"use client";
import { notFound, redirect, useParams } from "next/navigation";
import { ChatRouteSystem } from "@/components/chat-route-system";
import { useResolvedChatBootstrap } from "@/lib/use-resolved-chat-bootstrap";
import { useSession } from "@/providers/session-provider";

type ChatPageParams = {
  id?: string;
};

export function ChatPage() {
  const { id: chatId } = useParams<ChatPageParams>();
  const { bootstrapEntry, clearResolvedBootstrap, hasLiveBootstrapEntry } =
    useResolvedChatBootstrap(chatId ?? null);
  const { data: session, isPending } = useSession();

  // Anonymous users can't access persisted chat pages
  if (isPending && !session?.user) {
    return null;
  }

  if (!session?.user) {
    redirect("/");
  }

  if (!chatId) {
    return notFound();
  }

  return (
    <ChatRouteSystem
      bootstrapEntry={bootstrapEntry}
      chatId={chatId}
      hasLiveBootstrapEntry={hasLiveBootstrapEntry}
      onBootstrapSettled={clearResolvedBootstrap}
      routeSource="chat"
    />
  );
}
