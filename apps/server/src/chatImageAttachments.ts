import {
  type ChatImageAttachment,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  ThreadId,
} from "@t3tools/contracts";
import { Data, Effect, FileSystem, Path } from "effect";

import { createAttachmentId, resolveAttachmentPath } from "./attachmentStore.ts";
import { inferImageMimeTypeFromPath } from "./imageMime.ts";

export const PUBLISHABLE_CHAT_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
]);

export class PersistChatImageAttachmentError extends Data.TaggedError(
  "PersistChatImageAttachmentError",
)<{
  readonly message: string;
}> {}

function normalizeFileName(name: string): string {
  return name.trim().replaceAll("\\", "/").split("/").at(-1) ?? name.trim();
}

function validateAttachmentInput(input: {
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}): Effect.Effect<
  {
    readonly normalizedName: string;
    readonly normalizedMimeType: string;
  },
  PersistChatImageAttachmentError
> {
  const normalizedName = normalizeFileName(input.name);
  const normalizedMimeType = input.mimeType.trim().toLowerCase();

  if (normalizedName.length === 0) {
    return Effect.fail(
      new PersistChatImageAttachmentError({
        message: "Image attachment name cannot be empty.",
      }),
    );
  }
  if (!normalizedMimeType.startsWith("image/")) {
    return Effect.fail(
      new PersistChatImageAttachmentError({
        message: `Unsupported image MIME type '${input.mimeType}'.`,
      }),
    );
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    return Effect.fail(
      new PersistChatImageAttachmentError({
        message: `Image '${normalizedName}' is empty or too large.`,
      }),
    );
  }

  return Effect.succeed({
    normalizedName,
    normalizedMimeType,
  });
}

export const persistChatImageAttachment = (input: {
  readonly threadId: ThreadId;
  readonly stateDir: string;
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { normalizedName, normalizedMimeType } = yield* validateAttachmentInput(input);

    const attachmentId = createAttachmentId(input.threadId);
    if (!attachmentId) {
      return yield* new PersistChatImageAttachmentError({
        message: "Failed to create a safe image attachment id.",
      });
    }

    const attachment: ChatImageAttachment = {
      type: "image",
      id: attachmentId,
      name: normalizedName,
      mimeType: normalizedMimeType,
      sizeBytes: input.bytes.byteLength,
    };

    const attachmentPath = resolveAttachmentPath({
      stateDir: input.stateDir,
      attachment,
    });
    if (!attachmentPath) {
      return yield* new PersistChatImageAttachmentError({
        message: `Failed to resolve a persisted path for '${normalizedName}'.`,
      });
    }

    yield* fileSystem.makeDirectory(path.dirname(attachmentPath), { recursive: true }).pipe(
      Effect.mapError(
        () =>
          new PersistChatImageAttachmentError({
            message: `Failed to create an attachment directory for '${normalizedName}'.`,
          }),
      ),
    );
    yield* fileSystem.writeFile(attachmentPath, input.bytes).pipe(
      Effect.mapError(
        () =>
          new PersistChatImageAttachmentError({
            message: `Failed to persist image attachment '${normalizedName}'.`,
          }),
      ),
    );

    return attachment;
  });

export const persistChatImageAttachmentFromFile = (input: {
  readonly threadId: ThreadId;
  readonly stateDir: string;
  readonly filePath: string;
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const mimeType = inferImageMimeTypeFromPath(input.filePath);
    if (!mimeType) {
      return yield* new PersistChatImageAttachmentError({
        message: `Could not infer an image MIME type for '${input.filePath}'.`,
      });
    }

    const bytes = yield* fileSystem.readFile(input.filePath).pipe(
      Effect.mapError(
        () =>
          new PersistChatImageAttachmentError({
            message: `Failed to read image file '${input.filePath}'.`,
          }),
      ),
    );

    return yield* persistChatImageAttachment({
      threadId: input.threadId,
      stateDir: input.stateDir,
      name: path.basename(input.filePath),
      mimeType,
      bytes,
    });
  });
