import assert from "node:assert/strict";
import type { ModelMessage } from "ai";
import { afterEach, describe, it, vi } from "vitest";

const { downloadFile } = vi.hoisted(() => ({
  downloadFile: vi.fn(),
}));

vi.mock("@/lib/url", () => ({
  getBaseUrl: () => "https://chat.example",
}));

vi.mock("@/lib/file-storage", () => ({ downloadFile }));

import { replaceFilePartUrlByBinaryDataInMessages } from "./download-assets";

describe("replaceFilePartUrlByBinaryDataInMessages", () => {
  afterEach(() => {
    downloadFile.mockReset();
    vi.unstubAllGlobals();
  });

  it("downloads managed files directly from storage", async () => {
    downloadFile.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      type: "image/png",
    });
    const fetchImplementation = vi.fn();
    vi.stubGlobal("fetch", fetchImplementation);

    const result = await replaceFilePartUrlByBinaryDataInMessages([
      {
        role: "user",
        content: [
          {
            type: "file",
            data: "/api/files/content?key=l_u0a2bkphKLFKsBI4q5Tue9.png",
            mediaType: "image/png",
          },
        ],
      },
    ]);

    assert.deepEqual(downloadFile.mock.calls, [
      ["l_u0a2bkphKLFKsBI4q5Tue9.png"],
    ]);
    assert.equal(fetchImplementation.mock.calls.length, 0);
    const message = result[0];
    assert(message && Array.isArray(message.content));
    const file = message.content[0];
    assert(file?.type === "file");
    assert(file.data instanceof Uint8Array);
    assert.deepEqual([...file.data], [1, 2, 3]);
  });

  it("downloads managed-looking URLs on other origins over HTTP", async () => {
    const fetchImplementation = vi.fn(() =>
      Promise.resolve(
        new Response(new Uint8Array([4, 5, 6]), {
          headers: { "content-type": "image/png" },
        })
      )
    );
    vi.stubGlobal("fetch", fetchImplementation);

    await replaceFilePartUrlByBinaryDataInMessages([
      {
        role: "user",
        content: [
          {
            type: "file",
            data: "https://files.example/api/files/content?key=l_u0a2bkphKLFKsBI4q5Tue9.png",
            mediaType: "image/png",
          },
        ],
      },
    ]);

    assert.equal(downloadFile.mock.calls.length, 0);
    assert.deepEqual(fetchImplementation.mock.calls, [
      [
        new URL(
          "https://files.example/api/files/content?key=l_u0a2bkphKLFKsBI4q5Tue9.png"
        ),
      ],
    ]);
  });

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
