"use client";

import { useSyncExternalStore } from "react";
import { generateUUID } from "@/lib/utils";

let homeDraftVersion = 0;
const projectDraftVersions = new Map<string, number>();
const draftIds = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribeDisabled() {
  return () => undefined;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function getDraftVersion(projectId?: string | null) {
  return projectId
    ? (projectDraftVersions.get(projectId) ?? 0)
    : homeDraftVersion;
}

function getDraftKey(projectId: string | null | undefined, version: number) {
  return `${projectId ?? "home"}:${version}`;
}

function getDraftChatId(projectId: string | null | undefined, version: number) {
  const key = getDraftKey(projectId, version);
  const existingId = draftIds.get(key);

  if (existingId) {
    return existingId;
  }

  const nextId = generateUUID();
  draftIds.set(key, nextId);
  return nextId;
}

export function resetDraftChatId(projectId?: string | null) {
  const currentVersion = getDraftVersion(projectId);
  draftIds.delete(getDraftKey(projectId, currentVersion));
  const nextVersion = currentVersion + 1;

  if (projectId) {
    projectDraftVersions.set(projectId, nextVersion);
    const nextId = getDraftChatId(projectId, nextVersion);
    emitChange();
    return nextId;
  }

  homeDraftVersion = nextVersion;
  const nextId = getDraftChatId(projectId, nextVersion);
  emitChange();
  return nextId;
}

export function useDraftChatId(
  projectId?: string | null,
  options?: { disabled?: boolean }
) {
  const disabled = options?.disabled ?? false;

  return useSyncExternalStore(
    disabled ? subscribeDisabled : subscribe,
    () =>
      disabled ? null : getDraftChatId(projectId, getDraftVersion(projectId)),
    () => null
  );
}
