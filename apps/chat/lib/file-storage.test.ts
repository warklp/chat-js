import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  config: { appPrefix: "storage-test" },
}));

vi.mock("./storage-provider", async () => {
  const { memory } = await import("files-sdk/memory");
  return {
    storageProvider: {
      createAdapter: () => memory(),
      options: {},
      slug: "memory",
    },
  };
});

vi.mock("./url", () => ({
  getBaseUrl: () => "https://chat.example",
}));

import { deleteFilesByUrls, listFiles, uploadFile } from "./file-storage";
import { keyFromFileUrl } from "./file-url";

describe("file storage", () => {
  it("uploads, lists, and deletes through Files SDK", async () => {
    const uploaded = await uploadFile("../hello.txt", "hello", "text/plain");
    const key = keyFromFileUrl(uploaded.url);

    assert(key);
    assert.equal(uploaded.pathname, "hello.txt");
    assert.equal(uploaded.contentType, "text/plain");
    assert.deepEqual(
      (await listFiles()).files.map((file) => file.pathname),
      [key]
    );

    const previousDeploymentUrl = uploaded.url.replace(
      "https://chat.example",
      "https://old-chat.example"
    );
    await deleteFilesByUrls([previousDeploymentUrl]);
    assert.equal((await listFiles()).files.length, 0);
  });
});
