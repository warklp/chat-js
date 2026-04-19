"use client";
import { notFound, useParams } from "next/navigation";
import { ChatRouteSystem } from "@/components/chat-route-system";
import { useResolvedChatBootstrap } from "@/lib/use-resolved-chat-bootstrap";

type ProjectChatPageParams = {
  chatId?: string;
  projectId?: string;
};

export function ProjectChatPage() {
  const params = useParams<ProjectChatPageParams>();
  const projectId = params.projectId;
  const chatId = params.chatId;
  const { bootstrapEntry, clearResolvedBootstrap, hasLiveBootstrapEntry } =
    useResolvedChatBootstrap(chatId ?? null);

  if (!(chatId && projectId)) {
    return notFound();
  }

  return (
    <ChatRouteSystem
      bootstrapEntry={bootstrapEntry}
      chatId={chatId}
      hasLiveBootstrapEntry={hasLiveBootstrapEntry}
      onBootstrapSettled={clearResolvedBootstrap}
      projectId={projectId}
      routeSource="project"
    />
  );
}
