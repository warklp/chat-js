"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ParamsOf } from "@/.next/types/routes";
import { ChatSystem } from "@/components/chat-system";
import { useProjectDraftVersion } from "@/lib/home-draft-reset";
import { generateUUID } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

function ProjectPageContent({ projectId }: { projectId: string }) {
  const draftVersion = useProjectDraftVersion(projectId);
  const [id, setId] = useState(() => generateUUID());
  const previousDraftVersion = useRef(draftVersion);
  const trpc = useTRPC();

  useEffect(() => {
    if (previousDraftVersion.current === draftVersion) {
      return;
    }

    previousDraftVersion.current = draftVersion;
    setId(generateUUID());
  }, [draftVersion]);

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
