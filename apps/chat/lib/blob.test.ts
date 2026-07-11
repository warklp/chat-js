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

import { GET } from "@/app/(chat)/api/files/content/route";
import {
  deleteFilesByUrls,
  keyFromFileRequest,
  listFiles,
  uploadFile,
} from "./blob";

describe("file storage", () => {
  it("uploads, lists, range-reads, and deletes through Files SDK", async () => {
    vi.stubEnv("APP_URL", "https://chat.example");

    const uploaded = await uploadFile("../hello.txt", "hello", "text/plain");
    const key = keyFromFileRequest(uploaded.url);

    assert(key);
    assert.equal(uploaded.pathname, "hello.txt");
    assert.equal(uploaded.contentType, "text/plain");
    assert.deepEqual(
      (await listFiles()).blobs.map((file) => file.pathname),
      [key]
    );

    const response = await GET(
      new Request(uploaded.url, { headers: { Range: "bytes=1-3" } })
    );
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 1-3/5");
    assert.equal(await response.text(), "ell");

    const suffixResponse = await GET(
      new Request(uploaded.url, { headers: { Range: "bytes=-2" } })
    );
    assert.equal(suffixResponse.status, 206);
    assert.equal(await suffixResponse.text(), "lo");

    await deleteFilesByUrls([uploaded.url]);
    assert.equal((await listFiles()).blobs.length, 0);
  });
});
