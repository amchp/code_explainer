import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ThreadId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAttachmentPath } from "./attachmentStore.ts";
import {
  persistChatImageAttachment,
  persistChatImageAttachmentFromFile,
} from "./chatImageAttachments.ts";

describe("chatImageAttachments", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTempDir(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "t3-chat-image-"));
    tempDirs.push(dir);
    return dir;
  }

  it("persists image bytes into the attachment store", async () => {
    const stateDir = makeTempDir();
    const attachment = await Effect.runPromise(
      persistChatImageAttachment({
        threadId: ThreadId.makeUnsafe("thread-1"),
        stateDir,
        name: "diagram.png",
        mimeType: "image/png",
        bytes: Buffer.from("hello"),
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    const persistedPath = resolveAttachmentPath({ stateDir, attachment });
    expect(persistedPath).toBeTruthy();
    expect(readFileSync(persistedPath!, "utf8")).toBe("hello");
  });

  it("persists local image files by copying them into the attachment store", async () => {
    const stateDir = makeTempDir();
    const sourcePath = path.join(stateDir, "source-diagram.png");
    writeFileSync(sourcePath, "png-bytes", "utf8");

    const attachment = await Effect.runPromise(
      persistChatImageAttachmentFromFile({
        threadId: ThreadId.makeUnsafe("thread-2"),
        stateDir,
        filePath: sourcePath,
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    const persistedPath = resolveAttachmentPath({ stateDir, attachment });
    expect(persistedPath).toBeTruthy();
    expect(persistedPath).not.toBe(sourcePath);
    expect(readFileSync(persistedPath!, "utf8")).toBe("png-bytes");
    expect(attachment.mimeType).toBe("image/png");
  });

  it("rejects non-image MIME types", async () => {
    const stateDir = makeTempDir();
    await expect(
      Effect.runPromise(
        persistChatImageAttachment({
          threadId: ThreadId.makeUnsafe("thread-3"),
          stateDir,
          name: "notes.txt",
          mimeType: "text/plain",
          bytes: Buffer.from("hello"),
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    ).rejects.toThrow("Unsupported image MIME type");
  });
});
