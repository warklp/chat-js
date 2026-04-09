import { describe, expect, it } from "bun:test";
import { buildConfigTs } from "./config-builder";

describe("buildConfigTs", () => {
  it("writes desktopApp.enabled=false for web-only scaffolds", () => {
    const output = buildConfigTs({
      appName: "My Chat",
      appPrefix: "my-chat",
      appUrl: "http://localhost:3000",
      withElectron: false,
      gateway: "vercel",
      features: {
        sandbox: false,
        webSearch: false,
        urlRetrieval: false,
        deepResearch: false,
        mcp: false,
        imageGeneration: false,
        attachments: false,
        followupSuggestions: true,
        parallelResponses: true,
      },
      auth: {
        google: false,
        github: true,
        vercel: false,
      },
    });

    expect(output).toMatch(/desktopApp:\s*{\s*enabled:\s*false,/m);
  });
  it("writes desktopApp.enabled=true for Electron scaffolds", () => {
    const output = buildConfigTs({
      appName: "My Chat",
      appPrefix: "my-chat",
      appUrl: "http://localhost:3000",
      withElectron: true,
      gateway: "vercel",
      features: {
        sandbox: false,
        webSearch: false,
        urlRetrieval: false,
        deepResearch: false,
        mcp: false,
        imageGeneration: false,
        attachments: false,
        followupSuggestions: true,
        parallelResponses: true,
      },
      auth: {
        google: false,
        github: true,
        vercel: false,
      },
    });

    expect(output).toMatch(/desktopApp:\s*{\s*enabled:\s*true,/m);
  });
});
