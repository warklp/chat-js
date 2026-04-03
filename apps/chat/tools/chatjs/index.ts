// All tools and UI components installed via `chatjs add`.
// This file is fully managed by the CLI — do not edit manually.

// [chatjs-registry:imports]
import { WordCountRenderer } from "@/tools/chatjs/word-count/renderer";
import { wordCount } from "@/tools/chatjs/word-count/tool";
// [/chatjs-registry:imports]

export const tools = {
  // [chatjs-registry:tools]
  wordCount,
  // [/chatjs-registry:tools]
} as const;

export const ui = {
  // [chatjs-registry:ui]
  "tool-wordCount": WordCountRenderer,
  // [/chatjs-registry:ui]
};
