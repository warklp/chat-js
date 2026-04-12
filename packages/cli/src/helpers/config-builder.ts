import { z } from "zod";
import {
  applyDefaults,
  configDescriptionSchema,
} from "../../../../apps/chat/lib/config-schema";
import type { ScaffoldConfigInput } from "../types";

function extractDescriptions(
  schema: z.ZodType,
  prefix = "",
  result: Map<string, string> = new Map(),
): Map<string, string> {
  if (schema.description && prefix) {
    result.set(prefix, schema.description);
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    for (const [key, propSchema] of Object.entries(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      extractDescriptions(propSchema as z.ZodType, path, result);
    }
  }

  return result;
}

const descriptions = extractDescriptions(configDescriptionSchema);

const VALID_KEY_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const formatKey = (key: string) =>
  VALID_KEY_REGEX.test(key) ? key : JSON.stringify(key);

function formatValue(value: unknown, indent: number): string {
  const spaces = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);

  if (value === null || value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((v) => typeof v === "string")) {
      return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    return `[\n${value
      .map((v) => `${inner}${formatValue(v, indent + 1)}`)
      .join(",\n")}\n${spaces}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{\n${entries
      .map(([k, v]) => `${inner}${formatKey(k)}: ${formatValue(v, indent + 1)}`)
      .join(",\n")},\n${spaces}}`;
  }

  return String(value);
}

function generateConfig(
  obj: Record<string, unknown>,
  indent: number,
  pathPrefix: string,
): string {
  const spaces = "  ".repeat(indent);

  return Object.entries(obj)
    .map(([key, value]) => {
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      const desc = descriptions.get(path);
      const comment = desc ? ` // ${desc}` : "";

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const nested = generateConfig(
          value as Record<string, unknown>,
          indent + 1,
          path,
        );
        return `${spaces}${formatKey(key)}: {\n${nested}\n${spaces}},`;
      }

      return `${spaces}${formatKey(key)}: ${formatValue(value, indent)},${comment}`;
    })
    .join("\n");
}

export function buildConfigTs(input: ScaffoldConfigInput): string {
  const fullConfig = applyDefaults(input);

  return `import { defineConfig } from "@/lib/config-schema";

/**
 * ChatJS Configuration
 *
 * Edit this file to customize your app.
 * @see https://chatjs.dev/docs/reference/config
 */
const config = defineConfig({
${generateConfig(fullConfig, 1, "")}
});

export default config;
`;
}
