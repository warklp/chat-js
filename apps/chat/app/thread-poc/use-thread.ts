"use client";

import { getMessageText, type MessageTreeSnapshot } from "@chatjs/thread";
import {
  type UseThreadHelpers as BaseUseThreadHelpers,
  useThread as useBaseThread,
} from "@chatjs/thread/react";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export type PocMetadata = {
  activeStreamId: string | null;
  createdAt: string;
  title?: string;
};

export type PocMessage = UIMessage<PocMetadata>;

export type { TreeStream } from "@chatjs/thread";

export type TreeSendOptions = Parameters<
  BaseUseThreadHelpers<PocMessage>["sendMessage"]
>[1] & {
  tree?: {
    follow?: boolean;
    from?: string | null;
    responseLabel?: string;
  };
};

export type ThreadConcurrency = {
  maxStreamsPerOrigin?: number;
  maxStreamsTotal?: number;
};

export type UseThreadOptions = {
  concurrency?: ThreadConcurrency;
};

export type UseThreadHelpers = BaseUseThreadHelpers<PocMessage>;

type StreamBody = {
  tree?: {
    assistantMessageId?: string;
    responseLabel?: string;
    streamId?: string;
    userMessageId?: string;
  };
};

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function createTextMessage({
  id,
  role,
  text,
  title,
}: {
  id: string;
  role: "assistant" | "user";
  text: string;
  title?: string;
}): PocMessage {
  return {
    id,
    metadata: {
      activeStreamId: null,
      createdAt: new Date().toISOString(),
      title,
    },
    parts: text ? [{ text, type: "text" }] : [],
    role,
  };
}

class FakeTreeTransport implements ChatTransport<PocMessage> {
  sendMessages({
    abortSignal,
    body,
    messages,
  }: Parameters<ChatTransport<PocMessage>["sendMessages"]>[0]) {
    const requestBody = body as StreamBody | undefined;
    const assistantMessageId =
      requestBody?.tree?.assistantMessageId ?? "assistant";
    const streamId =
      requestBody?.tree?.streamId ?? `stream:${assistantMessageId}`;
    const responseLabel = requestBody?.tree?.responseLabel ?? "response";
    const userText = getMessageText(messages.at(-1) as PocMessage);
    const text = `${responseLabel}: streaming from "${userText}". The cursor follows this response only while it remains the foreground stream.`;
    const tokens = text.split(" ");

    return Promise.resolve(
      new ReadableStream<UIMessageChunk<PocMetadata>>({
        async start(controller) {
          try {
            controller.enqueue({
              messageId: assistantMessageId,
              messageMetadata: {
                activeStreamId: streamId,
                createdAt: new Date().toISOString(),
                title: responseLabel,
              },
              type: "start",
            });
            controller.enqueue({ id: "text", type: "text-start" });

            for (const [index, token] of tokens.entries()) {
              await delay(80, abortSignal);
              controller.enqueue({
                delta: index === 0 ? token : ` ${token}`,
                id: "text",
                type: "text-delta",
              });
            }

            controller.enqueue({ id: "text", type: "text-end" });
            controller.enqueue({
              finishReason: "stop",
              messageMetadata: {
                activeStreamId: null,
                createdAt: new Date().toISOString(),
                title: responseLabel,
              },
              type: "finish",
            });
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      })
    );
  }

  reconnectToStream() {
    return Promise.resolve(null);
  }
}

const initialMessages = [
  createTextMessage({
    id: "user-a",
    role: "user",
    text: "Plan a launch checklist",
    title: "Original prompt",
  }),
  createTextMessage({
    id: "assistant-a",
    role: "assistant",
    text: "Initial linear answer on branch A.",
    title: "Branch A",
  }),
  createTextMessage({
    id: "user-b",
    role: "user",
    text: "Plan a calmer launch checklist",
    title: "Sibling prompt",
  }),
  createTextMessage({
    id: "assistant-b",
    role: "assistant",
    text: "Completed answer on branch B.",
    title: "Branch B",
  }),
] satisfies PocMessage[];

const initialTree: MessageTreeSnapshot<PocMessage> = {
  childrenByParentId: {
    __root__: ["user-a", "user-b"],
    "user-a": ["assistant-a"],
    "user-b": ["assistant-b"],
  },
  cursorId: "assistant-a",
  messagesById: Object.fromEntries(
    initialMessages.map((message) => [message.id, message])
  ),
  parentById: {
    "assistant-a": "user-a",
    "assistant-b": "user-b",
    "user-a": null,
    "user-b": null,
  },
  rootIds: ["user-a", "user-b"],
  version: 1,
};

export function readText(message: PocMessage) {
  return getMessageText(message);
}

export function useThread(options: UseThreadOptions = {}): UseThreadHelpers {
  const chat = useBaseThread<PocMessage>({
    concurrency: {
      maxActiveStreams: options.concurrency?.maxStreamsTotal,
      maxActiveStreamsPerParent: options.concurrency?.maxStreamsPerOrigin,
    },
    generateId: (() => {
      let counter = 100;
      return () => {
        counter += 1;
        return `message-${counter}`;
      };
    })(),
    initialTree,
    transport: new FakeTreeTransport(),
  });

  return chat;
}
