import { z } from "zod";
import { defineTool } from "@/lib/ai/tool-builder";

export const wordCount = defineTool({
  description: "Count the words, characters, and sentences in a given text",
  inputSchema: z.object({
    text: z.string().describe("The text to analyze"),
  }),
  execute: async ({ text }, { ctx }) => {
    ctx.costAccumulator.addAPICost("wordCount", 0);

    const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, "").length;
    const sentences = text
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0).length;

    return { words, characters, charactersNoSpaces, sentences };
  },
});

export type WordCountOutput = {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
};
