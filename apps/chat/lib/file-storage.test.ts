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

import {
  deleteFilesByUrls,
  keyFromFileRequest,
  listFiles,
  uploadFile,
} from "./file-storage";

describe("file storage", () => {
  it("uploads, lists, and deletes through Files SDK", async () => {
    vi.stubEnv("APP_URL", "https://chat.example");

    const uploaded = await uploadFile("../hello.txt", "hello", "text/plain");
    const key = keyFromFileRequest(uploaded.url);

    assert(key);
    assert.equal(uploaded.pathname, "hello.txt");
    assert.equal(uploaded.contentType, "text/plain");
    assert.deepEqual(
      (await listFiles()).files.map((file) => file.pathname),
      [key]
    );

    await deleteFilesByUrls([uploaded.url]);
    assert.equal((await listFiles()).files.length, 0);
  });
});
