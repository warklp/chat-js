import { tool } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("tools/retrieve-url");

export const retrieveUrl = tool({
  description: `Fetch structured information from a single URL via Firecrawl.

Use for:
- Extract content from a specific URL supplied by the user

Avoid:
- General-purpose web searches`,
  inputSchema: z.object({
    url: z.string().describe("The URL to retrieve the information from."),
  }),
  execute: async ({ url }: { url: string }) => {
    try {
      if (!env.FIRECRAWL_API_KEY) {
        return {
          error:
            "Firecrawl is not configured. Set FIRECRAWL_API_KEY to enable retrieval.",
        };
      }

      const { default: FirecrawlApp } = await import("@mendable/firecrawl-js");
      const app = new FirecrawlApp({ apiKey: env.FIRECRAWL_API_KEY });

      const content = await app.scrapeUrl(url);
      if (!(content.success && content.metadata)) {
        return { results: [{ error: content.error }] };
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
        const extractResult = await app.extract([url], {
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
            url: content.metadata.sourceURL,
            description: description || "",
            language: content.metadata.language,
          },
        ],
      };
    } catch (error) {
      log.error({ err: error, url }, "Firecrawl API error in retrieveUrl tool");
      return { error: "Failed to retrieve content" };
    }
  },
});
