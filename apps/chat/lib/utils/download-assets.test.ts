import assert from "node:assert/strict";
import type { ModelMessage } from "ai";
import { describe, it, vi } from "vitest";

vi.mock("@/lib/url", () => ({
  getBaseUrl: () => "https://chat.example",
}));

import { replaceFilePartUrlByBinaryDataInMessages } from "./download-assets";

describe("replaceFilePartUrlByBinaryDataInMessages", () => {
  it("resolves stable application file paths against the current app URL", async () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "file",
            data: "/api/files/content?key=l_u0a2bkphKLFKsBI4q5Tue9.png",
            mediaType: "image/png",
          },
          {
            type: "file",
            data: "aGVsbG8=",
            mediaType: "text/plain",
          },
        ],
      },
    ];
    let downloadedUrl: URL | undefined;

    const result = await replaceFilePartUrlByBinaryDataInMessages(
      messages,
      ({ url }) => {
        downloadedUrl = url;
        return Promise.resolve({
          data: new Uint8Array([1, 2, 3]),
          mediaType: "image/png",
        });
      }
    );

    assert.equal(
      downloadedUrl?.toString(),
      "https://chat.example/api/files/content?key=l_u0a2bkphKLFKsBI4q5Tue9.png"
    );
    const message = result[0];
    assert(message && Array.isArray(message.content));
    const file = message.content[0];
    assert(file?.type === "file");
    assert(file.data instanceof Uint8Array);
    assert.deepEqual([...file.data], [1, 2, 3]);
    const inlineFile = message.content[1];
    assert(inlineFile?.type === "file");
    assert.equal(inlineFile.data, "aGVsbG8=");
  });
});
