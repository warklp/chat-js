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

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

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

function displayUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

function getErrorName(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error;
  }
  return SAFE_ERROR_NAME.test(error.name) ? error.name : "Error";
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

          const resultUrl = displayUrl(parsedUrl);
          const normalizedUrl = parsedUrl.toString();
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
                url: resultUrl,
                description: description || "",
                language: content.metadata.language,
              },
            ],
          };
        } catch (error) {
          console.error("retrieveUrl failed", {
            errorName: getErrorName(error),
          });
          return { error: "Failed to retrieve content" };
        }
      },
    });
  },
} as const);
