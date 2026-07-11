import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getFileImageProps } from "./file-url";

describe("getFileImageProps", () => {
  it("makes managed worktree files same-origin for Next Image", () => {
    assert.deepEqual(
      getFileImageProps(
        "http://localhost:3030/api/files/content?key=l_u0a2bkphKLFKsBI4q5Tue9.png"
      ),
      {
        src: "/api/files/content?key=l_u0a2bkphKLFKsBI4q5Tue9.png",
        unoptimized: true,
      }
    );
  });

  it("leaves external images unchanged", () => {
    const url = "https://example.com/image.png";
    assert.deepEqual(getFileImageProps(url), { src: url, unoptimized: false });
  });
});
