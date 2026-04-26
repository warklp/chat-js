import type { ChatMessage } from "@/lib/ai/types";
import type { ParallelRequestSpec } from "@/lib/draft-chat-submission";
import type { ParsedChatIdFromPathname } from "@/providers/parse-chat-id-from-pathname";

export type InitialChatTransitionPhase = "submitted" | "confirmed";

export interface InitialChatTransition {
  chatId: string;
  fromPath: string;
  hasReachedToPath: boolean;
  message: ChatMessage;
  phase: InitialChatTransitionPhase;
  projectId: string | null;
  requestSpecs: ParallelRequestSpec[];
  runtimeKey: string;
  source: "home" | "project";
  toPath: string;
}

export function getBaseChatRuntimeKey({
  draftChatId,
  pathname,
  route,
}: {
  draftChatId?: string | null;
  pathname: string;
  route: ParsedChatIdFromPathname;
}) {
  if (draftChatId && (route.type === "home" || route.type === "projectHome")) {
    return `path:${pathname}:draft:${draftChatId}`;
  }

  return `path:${pathname}`;
}

export function shouldUseTransitionRuntimeKey({
  pathname,
  transition,
}: {
  pathname: string;
  transition: InitialChatTransition | null;
}) {
  return !!(
    transition &&
    (pathname === transition.toPath ||
      (!transition.hasReachedToPath && pathname === transition.fromPath))
  );
}

export function getChatRuntimeKey({
  baseRuntimeKey,
  pathname,
  transition,
}: {
  baseRuntimeKey: string;
  pathname: string;
  transition: InitialChatTransition | null;
}) {
  return shouldUseTransitionRuntimeKey({ pathname, transition })
    ? (transition?.runtimeKey ?? baseRuntimeKey)
    : baseRuntimeKey;
}

export function isTransitionRouteMismatch({
  pathname,
  transition,
}: {
  pathname: string;
  transition: InitialChatTransition;
}) {
  if (pathname === transition.toPath) {
    return false;
  }

  if (!transition.hasReachedToPath && pathname === transition.fromPath) {
    return false;
  }

  return true;
}
