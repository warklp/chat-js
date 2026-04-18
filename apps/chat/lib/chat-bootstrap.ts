"use client";

import { useSyncExternalStore } from "react";
import type { AppModelId } from "@/lib/ai/app-model-id";
import type { ChatMessage } from "@/lib/ai/types";
import { fetchWithErrorHandlers } from "@/lib/utils";
import type { ParallelRequestSpec } from "./draft-chat-submission";

interface PersistedParallelRequestSpec
  extends Omit<ParallelRequestSpec, "createdAt"> {
  createdAt: string;
}

interface SerializedBootstrapEntry {
  chatId: string;
  initialMessages: ChatMessage[];
  message: ChatMessage;
  primaryRequestBody: {
    assistantMessageId: string;
    isPrimaryParallel: true;
    parallelGroupId: string | null;
    parallelIndex: number;
    selectedModelId: AppModelId;
  } | null;
  projectId: string | null;
  secondaryRequestSpecs: PersistedParallelRequestSpec[];
}

export interface ChatBootstrapEntry {
  chatId: string;
  initialMessages: ChatMessage[];
  message: ChatMessage;
  primaryRequestBody: {
    assistantMessageId: string;
    isPrimaryParallel: true;
    parallelGroupId: string | null;
    parallelIndex: number;
    selectedModelId: AppModelId;
  } | null;
  projectId: string | null;
  secondaryRequestSpecs: ParallelRequestSpec[];
}

const STORAGE_KEY_PREFIX = "chat-bootstrap:";
const entries = new Map<string, ChatBootstrapEntry>();
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function serializeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      createdAt: new Date(message.metadata.createdAt),
    },
  };
}

function serializeEntry(entry: ChatBootstrapEntry): SerializedBootstrapEntry {
  return {
    ...entry,
    initialMessages: entry.initialMessages.map(serializeMessage),
    message: serializeMessage(entry.message),
    secondaryRequestSpecs: entry.secondaryRequestSpecs.map((requestSpec) => ({
      ...requestSpec,
      createdAt: requestSpec.createdAt.toISOString(),
    })),
  };
}

function deserializeEntry(entry: SerializedBootstrapEntry): ChatBootstrapEntry {
  return {
    ...entry,
    initialMessages: entry.initialMessages.map((message) => ({
      ...message,
      metadata: {
        ...message.metadata,
        createdAt: new Date(message.metadata.createdAt),
      },
    })),
    message: {
      ...entry.message,
      metadata: {
        ...entry.message.metadata,
        createdAt: new Date(entry.message.metadata.createdAt),
      },
    },
    secondaryRequestSpecs: entry.secondaryRequestSpecs.map((requestSpec) => ({
      ...requestSpec,
      createdAt: new Date(requestSpec.createdAt),
    })),
  };
}

function storageKey(chatId: string) {
  return `${STORAGE_KEY_PREFIX}${chatId}`;
}

function writeEntryToStorage(entry: ChatBootstrapEntry) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    storageKey(entry.chatId),
    JSON.stringify(serializeEntry(entry))
  );
}

function deleteEntryFromStorage(chatId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(storageKey(chatId));
}

function readEntryFromStorage(chatId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(storageKey(chatId));

  if (!raw) {
    return null;
  }

  try {
    return deserializeEntry(JSON.parse(raw) as SerializedBootstrapEntry);
  } catch (error) {
    console.error("Failed to parse bootstrap entry", error);
    deleteEntryFromStorage(chatId);
    return null;
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

async function drainSecondaryParallelRequest({
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
      assistantMessageId: requestSpec.assistantMessageId,
      selectedModelId: requestSpec.modelId,
      parallelGroupId: requestSpec.parallelGroupId,
      parallelIndex: requestSpec.parallelIndex,
      isPrimaryParallel: false,
    }),
  });

  await drainResponse(response);
}

async function runParallelSecondaryRequests(entry: ChatBootstrapEntry) {
  if (entry.secondaryRequestSpecs.length === 0) {
    return;
  }

  await fetchWithErrorHandlers("/api/chat/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: entry.chatId,
      message: entry.message,
      projectId: entry.projectId,
    }),
  });

  await Promise.all(
    entry.secondaryRequestSpecs.map((requestSpec) =>
      drainSecondaryParallelRequest({
        chatId: entry.chatId,
        message: entry.message,
        projectId: entry.projectId,
        requestSpec,
      })
    )
  );
}

export function createChatBootstrapEntry({
  chatId,
  message,
  projectId,
  requestSpecs,
}: {
  chatId: string;
  message: ChatMessage;
  projectId: string | null;
  requestSpecs: ParallelRequestSpec[];
}): ChatBootstrapEntry {
  const primaryRequest = requestSpecs[0];

  return {
    chatId,
    projectId,
    message,
    initialMessages: [message],
    primaryRequestBody: primaryRequest
      ? {
          assistantMessageId: primaryRequest.assistantMessageId,
          selectedModelId: primaryRequest.modelId,
          parallelGroupId: primaryRequest.parallelGroupId,
          parallelIndex: primaryRequest.parallelIndex,
          isPrimaryParallel: true,
        }
      : null,
    secondaryRequestSpecs: requestSpecs.slice(1),
  };
}

export function setChatBootstrap(entry: ChatBootstrapEntry) {
  entries.set(entry.chatId, entry);
  writeEntryToStorage(entry);
  emitChange();
}

export function clearChatBootstrap(chatId: string) {
  entries.delete(chatId);
  deleteEntryFromStorage(chatId);
  emitChange();
}

export function getChatBootstrap(chatId: string) {
  const existingEntry = entries.get(chatId);

  if (existingEntry) {
    return existingEntry;
  }

  const storedEntry = readEntryFromStorage(chatId);

  if (!storedEntry) {
    return null;
  }

  entries.set(chatId, storedEntry);
  return storedEntry;
}

export function useChatBootstrap(chatId: string | null) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (chatId ? getChatBootstrap(chatId) : null),
    () => null
  );
}

export async function runBootstrapSecondaryRequests(entry: ChatBootstrapEntry) {
  await runParallelSecondaryRequests(entry);
}
