"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";
import type { ParamsOf } from "@/.next/types/routes";
import { ChatSystem } from "@/components/chat-system";
import { useProjectDraftVersion } from "@/lib/home-draft-reset";
import { generateUUID } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

export function ProjectPage() {
  const { projectId } = useParams<ParamsOf<"/project/[projectId]">>();

  if (!projectId) {
    return notFound();
  }

  const draftVersion = useProjectDraftVersion(projectId);
  const id = useMemo(() => generateUUID(), [draftVersion]);
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
