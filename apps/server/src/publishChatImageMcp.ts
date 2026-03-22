import { statSync } from "node:fs";
import path from "node:path";

import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS, ThreadId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect } from "effect";

import {
  PUBLISHABLE_CHAT_IMAGE_EXTENSIONS,
  persistChatImageAttachmentFromFile,
} from "./chatImageAttachments.ts";

export const PUBLISH_IMAGES_TO_CHAT_TOOL_NAME = "publish_images_to_chat";
const JSON_RPC_VERSION = "2.0";

interface PublishChatImageMcpOptions {
  readonly threadId: string;
  readonly stateDir: string;
}

interface PublishedImageResult {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

interface SkippedImageResult {
  readonly path: string;
  readonly reason: string;
}

interface PublishImagesResult {
  readonly published: PublishedImageResult[];
  readonly skipped: SkippedImageResult[];
}

function parseArgs(argv: readonly string[]): PublishChatImageMcpOptions {
  let threadId: string | undefined;
  let stateDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--thread-id") {
      threadId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--state-dir") {
      stateDir = argv[index + 1];
      index += 1;
    }
  }

  if (!threadId || !stateDir) {
    throw new Error("publish-chat-image-mcp requires --thread-id and --state-dir.");
  }

  return { threadId, stateDir };
}

function extractPaths(argumentsValue: unknown): string[] | null {
  if (!argumentsValue || typeof argumentsValue !== "object") {
    return null;
  }
  const paths = (argumentsValue as Record<string, unknown>).paths;
  if (!Array.isArray(paths)) {
    return null;
  }
  const normalized = paths
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized;
}

function encodeMessage(message: unknown): Buffer {
  const json = JSON.stringify(message);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`, "utf8");
}

function writeMessage(message: unknown): void {
  process.stdout.write(encodeMessage(message));
}

function writeResponse(id: string | number, result: unknown): void {
  writeMessage({
    jsonrpc: JSON_RPC_VERSION,
    id,
    result,
  });
}

function writeError(id: string | number | null, code: number, message: string): void {
  writeMessage({
    jsonrpc: JSON_RPC_VERSION,
    ...(id !== null ? { id } : {}),
    error: {
      code,
      message,
    },
  });
}

function parseProtocolMessages(
  chunk: Buffer,
  state: { buffer: Buffer },
  onMessage: (message: unknown) => void,
): void {
  state.buffer = Buffer.concat([state.buffer, chunk]);

  while (state.buffer.length > 0) {
    const headerEnd = state.buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return;
    }

    const headerText = state.buffer.subarray(0, headerEnd).toString("utf8");
    const contentLengthHeader = headerText
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-length:"));
    if (!contentLengthHeader) {
      throw new Error("MCP client sent a message without Content-Length.");
    }

    const contentLength = Number.parseInt(contentLengthHeader.split(":")[1]?.trim() ?? "", 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new Error("MCP client sent an invalid Content-Length.");
    }

    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (state.buffer.length < messageEnd) {
      return;
    }

    const messageText = state.buffer.subarray(messageStart, messageEnd).toString("utf8");
    state.buffer = state.buffer.subarray(messageEnd);
    onMessage(JSON.parse(messageText));
  }
}

export async function publishImages(
  options: PublishChatImageMcpOptions,
  requestedPaths: readonly string[],
): Promise<PublishImagesResult> {
  const published: PublishedImageResult[] = [];
  const skipped: SkippedImageResult[] = [];
  const seenPaths = new Set<string>();

  for (const requestedPath of requestedPaths) {
    if (seenPaths.has(requestedPath)) {
      continue;
    }
    seenPaths.add(requestedPath);

    if (published.length >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
      skipped.push({
        path: requestedPath,
        reason: `Only ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images can be published per call.`,
      });
      continue;
    }

    if (/^(?:https?:|data:)/i.test(requestedPath)) {
      skipped.push({
        path: requestedPath,
        reason: "Only absolute local filesystem image paths are supported.",
      });
      continue;
    }

    if (!path.isAbsolute(requestedPath)) {
      skipped.push({
        path: requestedPath,
        reason: "Image path must be absolute.",
      });
      continue;
    }

    const extension = path.extname(requestedPath).toLowerCase();
    if (!PUBLISHABLE_CHAT_IMAGE_EXTENSIONS.has(extension)) {
      skipped.push({
        path: requestedPath,
        reason: "Unsupported image file type.",
      });
      continue;
    }

    let fileStat: ReturnType<typeof statSync>;
    try {
      fileStat = statSync(requestedPath);
    } catch {
      skipped.push({
        path: requestedPath,
        reason: "Image file does not exist or is not readable.",
      });
      continue;
    }

    if (!fileStat.isFile()) {
      skipped.push({
        path: requestedPath,
        reason: "Image path must point to a regular file.",
      });
      continue;
    }

    const attachment = await Effect.runPromise(
      persistChatImageAttachmentFromFile({
        threadId: ThreadId.makeUnsafe(options.threadId),
        stateDir: options.stateDir,
        filePath: requestedPath,
      }).pipe(Effect.provide(NodeServices.layer)),
    ).catch((error) => {
      skipped.push({
        path: requestedPath,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (!attachment) {
      continue;
    }

    published.push({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    });
  }

  return { published, skipped };
}

async function handleRequest(message: unknown, options: PublishChatImageMcpOptions): Promise<void> {
  if (!message || typeof message !== "object") {
    return;
  }

  const request = message as Record<string, unknown>;
  const method = typeof request.method === "string" ? request.method : null;
  const id =
    typeof request.id === "string" || typeof request.id === "number" ? request.id : undefined;
  if (!method) {
    if (id !== undefined) {
      writeError(id, -32600, "Invalid JSON-RPC request.");
    }
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (id === undefined) {
    return;
  }

  if (method === "initialize") {
    writeResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "t3-publish-chat-images",
        version: "0.1.0",
      },
    });
    return;
  }

  if (method === "ping") {
    writeResponse(id, {});
    return;
  }

  if (method === "tools/list") {
    writeResponse(id, {
      tools: [
        {
          name: PUBLISH_IMAGES_TO_CHAT_TOOL_NAME,
          description:
            "Publish selected local image files into the assistant chat message for the current turn.",
          inputSchema: {
            type: "object",
            properties: {
              paths: {
                type: "array",
                items: { type: "string" },
                description: "Absolute local image file paths to publish to the chat conversation.",
              },
            },
            required: ["paths"],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }

  if (method === "tools/call") {
    const params =
      request.params && typeof request.params === "object"
        ? (request.params as Record<string, unknown>)
        : {};
    const toolName = typeof params.name === "string" ? params.name : "";
    if (toolName !== PUBLISH_IMAGES_TO_CHAT_TOOL_NAME) {
      writeError(id, -32602, `Unknown tool '${toolName}'.`);
      return;
    }

    const requestedPaths = extractPaths(params.arguments);
    if (!requestedPaths) {
      writeError(id, -32602, "publish_images_to_chat requires a string array at arguments.paths.");
      return;
    }

    const result = await publishImages(options, requestedPaths);
    writeResponse(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
      structuredContent: result,
    });
    return;
  }

  writeError(id, -32601, `Method '${method}' is not supported.`);
}

export async function runPublishChatImageMcpServer(argv: readonly string[]): Promise<void> {
  const options = parseArgs(argv);
  const state = { buffer: Buffer.alloc(0) };

  process.stdin.on("data", (chunk: Buffer) => {
    try {
      parseProtocolMessages(chunk, state, (message) => {
        void handleRequest(message, options).catch((error) => {
          const messageText = error instanceof Error ? error.message : String(error);
          writeError(null, -32603, messageText);
        });
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      writeError(null, -32700, messageText);
    }
  });

  process.stdin.resume();
}
