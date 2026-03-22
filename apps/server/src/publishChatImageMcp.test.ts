import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { publishImages } from "./publishChatImageMcp.ts";

describe("publishChatImageMcp", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTempDir(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "t3-publish-chat-image-"));
    tempDirs.push(dir);
    return dir;
  }

  it("publishes valid local image files and reports skipped inputs", async () => {
    const stateDir = makeTempDir();
    const validPath = path.join(stateDir, "diagram.png");
    const invalidPath = path.join(stateDir, "notes.txt");
    writeFileSync(validPath, "png", "utf8");
    writeFileSync(invalidPath, "text", "utf8");

    const result = await publishImages(
      {
        threadId: "thread-1",
        stateDir,
      },
      [validPath, "https://example.com/image.png", invalidPath, "relative.png"],
    );

    expect(result.published).toEqual([
      expect.objectContaining({
        name: "diagram.png",
        mimeType: "image/png",
      }),
    ]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        path: "https://example.com/image.png",
        reason: "Only absolute local filesystem image paths are supported.",
      }),
      expect.objectContaining({
        path: invalidPath,
        reason: "Unsupported image file type.",
      }),
      expect.objectContaining({
        path: "relative.png",
        reason: "Image path must be absolute.",
      }),
    ]);
  });
});
