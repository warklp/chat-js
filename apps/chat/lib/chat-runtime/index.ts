/**
 * Chat runtime public API.
 *
 * This folder is the package-like boundary for the reusable multi-runtime
 * layer. Consumers should import from `@/lib/chat-runtime` instead of reaching
 * into individual files.
 *
 * Responsibilities owned here:
 * - one runtime per opaque runtime id
 * - runtime registry/provider state
 * - mounted background slots for app-provided runtime controllers
 *
 * Responsibilities intentionally kept outside this boundary:
 * - runtime id construction/parsing
 * - route parsing and route policy
 * - project context
 * - chat persistence/confirmation state
 * - persisted query loading and cache invalidation
 * - chat store creation and store providers
 * - app-specific store slices such as data stream/artifact/persistence state
 * - the chat UI
 * - the concrete streaming controller transport (`ChatSync` today)
 */

/**
 * App-facing convenience API for route hosts and chat actions.
 * Prefer these hooks over using the registry context directly from feature code.
 */
// biome-ignore lint/performance/noBarrelFile: This file is the documented runtime package boundary.
export {
  type ChatRuntimeActions,
  useChatRuntime,
  useChatRuntimeActions,
} from "./runtime-api";

/**
 * Runtime registry provider and mounted runtime slot renderer.
 * Mount `ChatRuntimeRegistryProvider` near the chat app root and
 * `MountedChatRuntimes` once outside the route tree.
 */
export {
  type ChatRuntimeEntry,
  ChatRuntimeRegistryProvider,
  type CreateRuntimeInput,
  MountedChatRuntimes,
  type RuntimeId,
} from "./runtime-registry-provider";
