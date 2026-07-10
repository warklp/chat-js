import type { AppModelId } from "@/lib/ai/app-model-id";
import type { ChatMessage } from "@/lib/ai/types";
import { summarizeThreadMessages, traceThread } from "@/lib/thread-debug";
import { fetchWithErrorHandlers } from "@/lib/utils";
import type { ParallelRequestSpec } from "./draft-chat-submission";

type AddMessageToTree = (message: ChatMessage) => void;

export interface ParallelRequestBody {
  assistantMessageId: string;
  isPrimaryParallel: boolean;
  parallelGroupId: string | null;
  parallelIndex: number;
  selectedModelId: AppModelId;
}

export function createParallelRequestBody(
  requestSpec: ParallelRequestSpec,
  isPrimaryParallel = requestSpec.isPrimary
): ParallelRequestBody {
  return {
    assistantMessageId: requestSpec.assistantMessageId,
    selectedModelId: requestSpec.modelId,
    parallelGroupId: requestSpec.parallelGroupId,
    parallelIndex: requestSpec.parallelIndex,
    isPrimaryParallel,
  };
}

function createAssistantPlaceholder({
  activeStreamId,
  parentMessageId,
  requestSpec,
}: {
  activeStreamId: string | null;
  parentMessageId: string;
  requestSpec: ParallelRequestSpec;
}): ChatMessage {
  return {
    id: requestSpec.assistantMessageId,
    parts: [],
    role: "assistant",
    metadata: {
      createdAt: requestSpec.createdAt,
      parentMessageId,
      parallelGroupId: requestSpec.parallelGroupId,
      parallelIndex: requestSpec.parallelIndex,
      isPrimaryParallel: requestSpec.isPrimary,
      selectedModel: requestSpec.modelId,
      activeStreamId,
      selectedTool: undefined,
    },
  };
}

export function createPendingAssistantMessage({
  activeStreamId,
  message,
  requestSpec,
}: {
  activeStreamId: string | null;
  message: ChatMessage;
  requestSpec: ParallelRequestSpec;
}) {
  return createAssistantPlaceholder({
    activeStreamId,
    parentMessageId: message.id,
    requestSpec,
  });
}

export function addPendingAssistantMessages({
  addMessageToTree,
  message,
  requestSpecs,
}: {
  addMessageToTree: AddMessageToTree;
  message: ChatMessage;
  requestSpecs: ParallelRequestSpec[];
}) {
  traceThread("parallel-request", "placeholders.add", {
    messageId: message.id,
    requestSpecs,
  });
  for (const requestSpec of requestSpecs) {
    addMessageToTree(
      createPendingAssistantMessage({
        activeStreamId: `pending:${requestSpec.assistantMessageId}`,
        message,
        requestSpec,
      })
    );
  }
}

export function markParallelRequestSpecsFailed({
  addMessageToTree,
  message,
  requestSpecs,
}: {
  addMessageToTree: AddMessageToTree;
  message: ChatMessage;
  requestSpecs: ParallelRequestSpec[];
}) {
  for (const requestSpec of requestSpecs) {
    addMessageToTree(
      createAssistantPlaceholder({
        activeStreamId: null,
        parentMessageId: message.id,
        requestSpec,
      })
    );
  }
}

async function drainResponse(response: Response) {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();

  while (true) {
    const { done } = await reader.read();

    if (done) {
      break;
    }
  }
}

async function drainParallelRequest({
  chatId,
  message,
  projectId,
  requestSpec,
}: {
  chatId: string;
  message: ChatMessage;
  projectId: string | null;
  requestSpec: ParallelRequestSpec;
}) {
  traceThread("parallel-request", "secondary.fetch.start", {
    assistantMessageId: requestSpec.assistantMessageId,
    chatId,
    messageId: message.id,
    parallelGroupId: requestSpec.parallelGroupId,
    parallelIndex: requestSpec.parallelIndex,
  });
  const response = await fetchWithErrorHandlers("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: chatId,
      message,
      prevMessages: [],
      projectId,
      ...createParallelRequestBody(requestSpec, false),
    }),
  });

  traceThread("parallel-request", "secondary.fetch.response", {
    assistantMessageId: requestSpec.assistantMessageId,
    chatId,
    ok: response.ok,
    status: response.status,
  });

  await drainResponse(response);
  traceThread("parallel-request", "secondary.fetch.drained", {
    assistantMessageId: requestSpec.assistantMessageId,
    chatId,
  });
}

export async function runParallelRequestSpecs({
  chatId,
  message,
  projectId,
  requestSpecs,
}: {
  chatId: string;
  message: ChatMessage;
  projectId: string | null;
  requestSpecs: ParallelRequestSpec[];
}) {
  if (requestSpecs.length === 0) {
    traceThread("parallel-request", "run.skipEmpty", {
      chatId,
      messageId: message.id,
    });
    return [];
  }

  traceThread("parallel-request", "prepare.start", {
    chatId,
    message: summarizeThreadMessages([message])[0],
    requestSpecs,
  });
  try {
    const response = await fetchWithErrorHandlers("/api/chat/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: chatId,
        message,
        projectId,
      }),
    });
    traceThread("parallel-request", "prepare.finish", {
      chatId,
      ok: response.ok,
      status: response.status,
    });
  } catch (error) {
    traceThread("parallel-request", "prepare.error", {
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    return requestSpecs;
  }

  const results = await Promise.allSettled(
    requestSpecs.map((requestSpec) =>
      drainParallelRequest({
        chatId,
        message,
        projectId,
        requestSpec,
      })
    )
  );

  traceThread("parallel-request", "run.finish", {
    chatId,
    results: results.map((result, index) => {
      let error: string | null = null;
      if (result.status === "rejected") {
        error =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
      }
      return {
        assistantMessageId: requestSpecs[index]?.assistantMessageId,
        error,
        status: result.status,
      };
    }),
  });

  return requestSpecs.filter(
    (_requestSpec, index) => results[index]?.status === "rejected"
  );
}
