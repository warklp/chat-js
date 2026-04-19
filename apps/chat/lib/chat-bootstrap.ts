"use client";

import { useSyncExternalStore } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import type { ParallelRequestSpec } from "./draft-chat-submission";
import {
  createParallelRequestBody,
  type ParallelRequestBody,
  runParallelRequestSpecs,
} from "./parallel-chat-requests";

interface PersistedParallelRequestSpec
  extends Omit<ParallelRequestSpec, "createdAt"> {
  createdAt: string;
}

interface SerializedBootstrapEntry {
  chatId: string;
  initialMessages: ChatMessage[];
  message: ChatMessage;
  projectId: string | null;
  requestSpecs: PersistedParallelRequestSpec[];
}

export interface ChatBootstrapEntry {
  chatId: string;
  initialMessages: ChatMessage[];
  message: ChatMessage;
  projectId: string | null;
  requestSpecs: ParallelRequestSpec[];
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
    requestSpecs: entry.requestSpecs.map((requestSpec) => ({
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
    requestSpecs: entry.requestSpecs.map((requestSpec) => ({
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
  return {
    chatId,
    projectId,
    message,
    initialMessages: [message],
    requestSpecs,
  };
}

export function getChatBootstrapPrimaryRequestBody(
  entry: ChatBootstrapEntry
): ParallelRequestBody | null {
  const primaryRequest = entry.requestSpecs[0];

  if (!primaryRequest) {
    return null;
  }

  return createParallelRequestBody(primaryRequest, true);
}

export function getChatBootstrapSecondaryRequestSpecs(
  entry: ChatBootstrapEntry
) {
  return entry.requestSpecs.slice(1);
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

export function runBootstrapSecondaryRequests(entry: ChatBootstrapEntry) {
  return runParallelRequestSpecs({
    chatId: entry.chatId,
    message: entry.message,
    projectId: entry.projectId,
    requestSpecs: getChatBootstrapSecondaryRequestSpecs(entry),
  });
}
