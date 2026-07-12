import FirecrawlApp from "@mendable/firecrawl-js";
import { tool } from "ai";
import { z } from "zod";
import {
  defineTool,
  type ToolRuntimeContext,
} from "@toolkit/lib/runtime";

type ToolEnvVars = {
  description?: string;
  options: string[][];
}[];

export const toolEnvVars: ToolEnvVars = [
  {
    description: "FIRECRAWL_API_KEY",
    options: [["FIRECRAWL_API_KEY"]],
  },
];

function parseUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function redactUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

function serializeError(error: unknown, sensitiveValues: string[]) {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of sensitiveValues
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    message = message.replaceAll(value, "[REDACTED_URL]");
  }
  return error instanceof Error ? { message, name: error.name } : { message };
}

export const retrieveUrl = defineTool({
  id: "retrieve-url",
  needs: ["env.read", "url.retrieve"],
  createTool: (ctx: ToolRuntimeContext) => {
    const app = ctx.env.get("FIRECRAWL_API_KEY")
      ? new FirecrawlApp({ apiKey: ctx.env.require("FIRECRAWL_API_KEY") })
      : null;

    return tool({
      description: `Fetch structured information from a single URL via Firecrawl.

Use for:
- Extract content from a specific URL supplied by the user

Avoid:
- General-purpose web searches`,
      inputSchema: z.object({
        url: z.string().describe("The URL to retrieve the information from."),
      }),
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Retrieval fallbacks are kept together to preserve the provider response flow.
      execute: async ({ url }: { url: string }) => {
        let safeUrl: string | undefined;
        const sensitiveUrls: string[] = [];
        try {
          if (!app) {
            return {
              error:
                "Firecrawl is not configured. Set FIRECRAWL_API_KEY to enable retrieval.",
            };
          }
          const parsedUrl = parseUrl(url);
          if (!parsedUrl) {
            return {
              error: "Please provide a valid http:// or https:// URL.",
            };
          }

          const redactedUrl = redactUrl(parsedUrl);
          safeUrl = redactedUrl;
          const normalizedUrl = parsedUrl.toString();
          sensitiveUrls.push(url, normalizedUrl);
          const content = await app.scrapeUrl(normalizedUrl);
          if (!(content.success && content.metadata)) {
            return {
              results: [
                {
                  error: content.error,
                },
              ],
            };
          }

          const schema = z.object({
            title: z.string(),
            content: z.string(),
            description: z.string(),
          });

          let title = content.metadata.title;
          let description = content.metadata.description;
          let extractedContent = content.markdown;

          if (!(title && description && extractedContent)) {
            const extractResult = await app.extract([normalizedUrl], {
              prompt:
                "Extract the page title, main content, and a brief description.",
              schema,
            });

            if (extractResult.success && extractResult.data) {
              title = title || extractResult.data.title;
              description = description || extractResult.data.description;
              extractedContent = extractedContent || extractResult.data.content;
            }
          }

          return {
            results: [
              {
                title: title || "Untitled",
                content: extractedContent || "",
                url: redactedUrl,
                description: description || "",
                language: content.metadata.language,
              },
            ],
          };
        } catch (error) {
          console.error("retrieveUrl failed", {
            error: serializeError(error, sensitiveUrls),
            url: safeUrl,
          });
          return { error: "Failed to retrieve content" };
        }
      },
    });
  },
} as const);
