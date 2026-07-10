import { describe, expect, it } from "bun:test";
import {
  createEmptyToolsTemplate,
  createEmptyUiTemplate,
  injectTool,
  removeTool,
} from "./inject-tool";

describe("registry index mutation", () => {
  it("removes tool and renderer entries from managed marker blocks", () => {
    const installed = injectTool({
      toolsSource: createEmptyToolsTemplate(),
      uiSource: createEmptyUiTemplate(),
      name: "word-count",
      toolsAlias: "@/tools/chatjs",
    });

    const removed = removeTool({
      ...installed,
      name: "word-count",
      toolsAlias: "@/tools/chatjs",
    });

    expect(removed.toolsSource).not.toContain("wordCount");
    expect(removed.uiSource).not.toContain("WordCountRenderer");
    expect(removed.uiSource).not.toContain("tool-wordCount");
  });

  it("does not remove similarly named tools", () => {
    let updated = injectTool({
      toolsSource: createEmptyToolsTemplate(),
      uiSource: createEmptyUiTemplate(),
      name: "word-count",
      toolsAlias: "@/tools/chatjs",
    });
    updated = injectTool({
      ...updated,
      name: "word-count-plus",
      toolsAlias: "@/tools/chatjs",
    });

    const removed = removeTool({
      ...updated,
      name: "word-count",
      toolsAlias: "@/tools/chatjs",
    });

    expect(removed.toolsSource).not.toContain("import { wordCount }");
    expect(removed.toolsSource).not.toContain("\n  wordCount,\n");
    expect(removed.toolsSource).toContain("wordCountPlus");
    expect(removed.uiSource).toContain("WordCountPlusRenderer");
    expect(removed.uiSource).toContain("tool-wordCountPlus");
  });
});
