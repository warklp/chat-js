/**
 * Runtime registry public API.
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
 * - app-specific context
 * - persistence/confirmation state
 * - persisted query loading and cache invalidation
 * - store creation and store providers
 * - app-specific state shape
 * - UI
 * - concrete background controllers
 */

/**
 * App-facing convenience API.
 * Prefer these hooks over using the registry context directly from feature code.
 */
// biome-ignore lint/performance/noBarrelFile: This file is the documented runtime package boundary.
export {
  type RuntimeActions,
  useRuntime,
  useRuntimeActions,
} from "./runtime-api";

/**
 * Runtime registry provider and mounted runtime slot renderer.
 * Mount `RuntimeRegistryProvider` near the app root and `MountedRuntimes`
 * once outside the route tree.
 */
export {
  type CreateRuntimeInput,
  MountedRuntimes,
  type Runtime,
  type RuntimeId,
  RuntimeRegistryProvider,
  useRuntimeRegistry,
} from "./runtime-registry-provider";
