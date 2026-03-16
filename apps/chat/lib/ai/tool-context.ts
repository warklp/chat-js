import { AsyncLocalStorage } from "node:async_hooks";
import type { UIMessageStreamWriter } from "ai";
import type { CostAccumulator } from "@/lib/credits/cost-accumulator";

export type ToolContext = {
  // biome-ignore lint/suspicious/noExplicitAny: generic erased to avoid circular dep with lib/ai/types.ts
  dataStream: UIMessageStreamWriter<any>;
  costAccumulator: CostAccumulator;
  selectedModel: string;
};

const storage = new AsyncLocalStorage<ToolContext>();

export function withToolContext<T>(ctx: ToolContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getToolContext(): ToolContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "getToolContext() called outside of a tool execution context"
    );
  }
  return ctx;
}
