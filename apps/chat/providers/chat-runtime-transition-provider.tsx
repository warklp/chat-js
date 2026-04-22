"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import type {
  InitialChatTransition,
  InitialChatTransitionPhase,
} from "@/lib/chat-runtime-transition";
import type { ParallelRequestSpec } from "@/lib/draft-chat-submission";

export interface StartInitialChatTransitionInput {
  chatId: string;
  message: ChatMessage;
  projectId: string | null;
  requestSpecs: ParallelRequestSpec[];
  runtimeKey: string;
  source: "home" | "project";
  toPath: string;
}

interface ChatRuntimeTransitionContextValue {
  markTransitionPhase: (
    chatId: string,
    phase: InitialChatTransitionPhase
  ) => void;
  settleTransition: (chatId: string) => void;
  startInitialTransition: (input: StartInitialChatTransitionInput) => boolean;
  transition: InitialChatTransition | null;
}

const ChatRuntimeTransitionContext =
  createContext<ChatRuntimeTransitionContextValue | null>(null);

export function ChatRuntimeTransitionProvider({
  children,
  markTransitionPhase,
  settleTransition,
  startInitialTransition,
  transition,
}: ChatRuntimeTransitionContextValue & { children: ReactNode }) {
  return (
    <ChatRuntimeTransitionContext.Provider
      value={{
        markTransitionPhase,
        settleTransition,
        startInitialTransition,
        transition,
      }}
    >
      {children}
    </ChatRuntimeTransitionContext.Provider>
  );
}

export function useChatRuntimeTransition() {
  const context = useContext(ChatRuntimeTransitionContext);

  if (context) {
    return context;
  }

  const noop = () => undefined;

  return {
    markTransitionPhase: noop,
    settleTransition: noop,
    startInitialTransition: () => false,
    transition: null,
  } satisfies ChatRuntimeTransitionContextValue;
}

export function useActiveInitialChatTransition(chatId: string) {
  const { transition } = useChatRuntimeTransition();

  return transition?.chatId === chatId ? transition : null;
}
