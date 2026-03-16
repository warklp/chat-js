import { tool } from "ai";
import type { ZodType } from "zod";
import { getToolContext, type ToolContext } from "./tool-context";

/**
 * Like tRPC's `t.procedure`, `defineTool` wraps the AI SDK's `tool()` and
 * injects the per-request `ctx` (dataStream, costAccumulator, selectedModel)
 * as a second argument to `execute` — without requiring factory functions or
 * changes to `tools/index.ts`.
 *
 * Context is propagated via AsyncLocalStorage, set up with `withToolContext`
 * in the chat route before `streamText` is called.
 *
 * @example
 * export const myTool = defineTool({
 *   description: "...",
 *   inputSchema: z.object({ query: z.string() }),
 *   execute: async ({ query }, { ctx }) => {
 *     ctx.costAccumulator.addAPICost("myTool", 5);
 *   },
 * });
 */
export function defineTool<TSchema extends ZodType, TOutput>({
  description,
  inputSchema,
  execute,
}: {
  description: string;
  inputSchema: TSchema;
  execute: (
    input: TSchema["_output"],
    options: { ctx: ToolContext; toolCallId: string }
  ) => Promise<TOutput>;
}) {
  // biome-ignore lint/suspicious/noExplicitAny: bypasses Zod v3/v4 shape mismatch in AI SDK's FlexibleSchema
  return (tool as any)({
    description,
    inputSchema,
    execute: async (
      input: TSchema["_output"],
      { toolCallId }: { toolCallId: string }
    ) => {
      const ctx = getToolContext();
      return execute(input, { ctx, toolCallId });
    },
  }) as ReturnType<typeof tool<TSchema["_output"], TOutput>>;
}
