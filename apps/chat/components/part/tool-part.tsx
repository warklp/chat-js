"use client";

import type { ToolUIPart } from "ai";
import type { ComponentType } from "react";
import {
  type InstalledToolPart,
  type InstalledToolType,
  isInstalledToolType,
  type ToolRendererProps,
  toolRendererRegistry,
} from "@/lib/ai/tool-renderer-registry";
import type { ChatTools } from "@/lib/ai/types";
import { CodeExecution } from "./code-execution";
import { DeepResearch } from "./deep-research";
import { DocumentTool } from "./document-tool";
import { GenerateImage } from "./generate-image";
import { GenerateVideo } from "./generate-video";
import { ReadDocument } from "./read-document";
import { WebSearch } from "./web-search";

interface ToolPartProps {
  isReadonly: boolean;
  messageId: string;
  part: ToolUIPart<ChatTools>;
}

function renderInstalledTool<T extends InstalledToolType>({
  part,
  messageId,
  isReadonly,
}: {
  part: InstalledToolPart<T>;
  messageId: string;
  isReadonly: boolean;
}) {
  const Renderer = toolRendererRegistry[part.type] as unknown as ComponentType<
    ToolRendererProps<T>
  >;

  return <Renderer isReadonly={isReadonly} messageId={messageId} tool={part} />;
}

export function ToolPart({ part, messageId, isReadonly }: ToolPartProps) {
  const type = part.type;

  if (
    type === "tool-createTextDocument" ||
    type === "tool-createCodeDocument" ||
    type === "tool-createSheetDocument" ||
    type === "tool-editTextDocument" ||
    type === "tool-editCodeDocument" ||
    type === "tool-editSheetDocument"
  ) {
    return (
      <DocumentTool isReadonly={isReadonly} messageId={messageId} tool={part} />
    );
  }

  if (type === "tool-readDocument") {
    return <ReadDocument tool={part} />;
  }

  if (type === "tool-codeExecution") {
    return <CodeExecution tool={part} />;
  }

  if (type === "tool-generateImage") {
    return <GenerateImage tool={part} />;
  }

  if (type === "tool-generateVideo") {
    return <GenerateVideo tool={part} />;
  }

  if (type === "tool-deepResearch") {
    return <DeepResearch messageId={messageId} part={part} />;
  }

  if (type === "tool-webSearch") {
    return <WebSearch messageId={messageId} part={part} />;
  }

  if (isInstalledToolType(type)) {
    return renderInstalledTool({
      part: part as InstalledToolPart<typeof type>,
      messageId,
      isReadonly,
    });
  }

  return null;
}
