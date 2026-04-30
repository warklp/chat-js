/**
 * Chat runtime public API.
 *
 * This folder is the package-like boundary for the reusable multi-chat runtime
 * layer. Consumers should import from `@/lib/chat-runtime` instead of reaching
 * into individual files.
 *
 * Responsibilities owned here:
 * - one runtime per chat id
 * - runtime registry/provider state
 * - provisional/confirmed runtime lifecycle
 * - pending submission handoff to the runtime controller
 * - store instance lifetime for background + visible chat trees
 *
 * Responsibilities intentionally kept outside this boundary:
 * - route parsing and route policy
 * - persisted query loading and cache invalidation
 * - concrete chat store implementation details
 * - app-specific store slices such as data stream/artifact state
 * - the chat UI
 * - the concrete streaming controller transport (`ChatSync` today)
 */

/**
 * App-facing convenience API for route hosts and chat actions.
 * Prefer these hooks over using the registry context directly from feature code.
 */
// biome-ignore lint/performance/noBarrelFile: This file is the documented runtime package boundary.
export {
  type ChatRuntimeApi,
  useChatRuntime,
  useChatRuntimeApi,
  useIsChatPersisted,
} from "./runtime-api";

/**
 * Runtime registry provider and low-level registry operations.
 * Mount `ChatRuntimeRegistryProvider` near the chat app root and
 * `MountedChatRuntimes` once outside the route tree.
 */
export {
  type ChatRuntimeEntry,
  type ChatRuntimeId,
  ChatRuntimeRegistryProvider,
  type EnsureProvisionalRuntimeInput,
  MountedChatRuntimes,
  type PendingChatSubmission,
  type StartConfirmedRuntimeInput,
  type SubmitProvisionalRuntimeInput,
  useChatRuntimeRegistry,
} from "./runtime-registry-provider";
