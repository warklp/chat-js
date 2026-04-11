import type { InferUITool, Tool, ToolUIPart } from "ai";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type ToolPartFromTool<NAME extends string, T extends Tool> = ToolUIPart<{
  [K in NAME]: InferUITool<T>;
}>;

export type TypelessToolPartFromTool<
  NAME extends string,
  T extends Tool,
> = DistributiveOmit<ToolPartFromTool<NAME, T>, "type">;
