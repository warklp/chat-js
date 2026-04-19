"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import type { ParamsOf } from "@/.next/types/routes";
import { ChatSystem } from "@/components/chat-system";
import { useDraftChatId } from "@/lib/draft-chat";
import { useTRPC } from "@/trpc/react";

function ProjectPageContent({ projectId }: { projectId: string }) {
  const id = useDraftChatId(projectId);
  const trpc = useTRPC();

  const { data: project } = useSuspenseQuery(
    trpc.project.getById.queryOptions({ id: projectId })
  );

  if (!project) {
    return notFound();
  }

  return (
    <ChatSystem
      id={id}
      initialMessages={[]}
      isReadonly={false}
      persistedQueriesEnabled={false}
      projectId={project.id}
      routeSource="project"
    />
  );
}

export function ProjectPage() {
  const { projectId } = useParams<ParamsOf<"/project/[projectId]">>();

  if (!projectId) {
    return notFound();
  }

  return <ProjectPageContent projectId={projectId} />;
}
