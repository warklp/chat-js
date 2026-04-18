"use client";

import { useSyncExternalStore } from "react";

let homeDraftVersion = 0;
const projectDraftVersions = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function resetHomeDraft() {
  homeDraftVersion += 1;
  emitChange();
}

export function resetProjectDraft(projectId: string) {
  projectDraftVersions.set(
    projectId,
    (projectDraftVersions.get(projectId) ?? 0) + 1
  );
  emitChange();
}

export function useHomeDraftVersion() {
  return useSyncExternalStore(
    subscribe,
    () => homeDraftVersion,
    () => homeDraftVersion
  );
}

export function useProjectDraftVersion(projectId: string) {
  return useSyncExternalStore(
    subscribe,
    () => projectDraftVersions.get(projectId) ?? 0,
    () => projectDraftVersions.get(projectId) ?? 0
  );
}
