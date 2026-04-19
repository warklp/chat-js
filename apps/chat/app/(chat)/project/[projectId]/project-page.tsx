"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import { ChatSystem } from "@/components/chat-system";
import { useDraftChatId } from "@/lib/draft-chat";
import { useTRPC } from "@/trpc/react";

type ProjectPageParams = {
  projectId?: string;
};

function ProjectPageContent({ projectId }: { projectId: string }) {
  const id = useDraftChatId(projectId);
  const trpc = useTRPC();

  const { data: project } = useSuspenseQuery(
    trpc.project.getById.queryOptions({ id: projectId })
  );

  if (!project) {
    return notFound();
  }

  if (!id) {
    return null;
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
  const { projectId } = useParams<ProjectPageParams>();

  if (!projectId) {
    return notFound();
  }

  return <ProjectPageContent projectId={projectId} />;
}
