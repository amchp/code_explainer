import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { DiagramToolIntegrationId } from "@t3tools/contracts";
import { getInstallableDiagramToolDefinition } from "@t3tools/shared/diagramTools";
import { toSafeThreadAttachmentSegment } from "./attachmentStore.ts";

export const PUBLISH_IMAGES_TO_CHAT_MCP_SERVER_NAME = "t3_publish_chat_images";

/**
 * Resolve the path to the codex config.toml file.
 * Uses CODEX_HOME env var if set, otherwise ~/.codex.
 */
export function resolveCodexConfigPath(codexHomePath?: string): string {
  const codexHome = codexHomePath || process.env.CODEX_HOME || path.join(homedir(), ".codex");
  return path.join(codexHome, "config.toml");
}

function resolveCodexHomePath(codexHomePath?: string): string {
  return codexHomePath || process.env.CODEX_HOME || path.join(homedir(), ".codex");
}

function escapeTomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function encodeTomlStringArray(values: readonly string[]): string {
  return `[${values.map((value) => escapeTomlString(value)).join(", ")}]`;
}

function stripTomlSection(content: string, sectionHeader: string): string {
  const sectionStart = content.indexOf(sectionHeader);
  if (sectionStart === -1) {
    return content;
  }

  const sectionContentStart = sectionStart + sectionHeader.length;
  const nextSectionRelativeIndex = content.slice(sectionContentStart).search(/\n\[/);
  const sectionEnd =
    nextSectionRelativeIndex === -1
      ? content.length
      : sectionContentStart + nextSectionRelativeIndex + 1;
  const prefix = content.slice(0, sectionStart).replace(/\s*$/, "\n");
  const suffix = content.slice(sectionEnd).replace(/^\s+/, "");
  return `${prefix}${suffix}`.trimEnd();
}

export function buildPublishImagesToChatMcpSection(input: {
  readonly command: string;
  readonly args: readonly string[];
}): string {
  return [
    `[mcp_servers.${PUBLISH_IMAGES_TO_CHAT_MCP_SERVER_NAME}]`,
    `command = ${escapeTomlString(input.command)}`,
    `args = ${encodeTomlStringArray(input.args)}`,
    "startup_timeout_sec = 15",
  ].join("\n");
}

export function createCodexHomeOverlay(input: {
  readonly threadId: string;
  readonly stateDir: string;
  readonly baseHomePath?: string;
  readonly publishServerCommand: string;
  readonly publishServerArgs: readonly string[];
}): string {
  const baseHomePath = resolveCodexHomePath(input.baseHomePath);
  const baseConfigPath = resolveCodexConfigPath(baseHomePath);
  const threadSegment = toSafeThreadAttachmentSegment(input.threadId) ?? "thread";
  const overlayHomePath = path.join(input.stateDir, "codex-home", threadSegment);
  const overlayConfigPath = resolveCodexConfigPath(overlayHomePath);

  mkdirSync(overlayHomePath, { recursive: true });

  const existingConfig = existsSync(baseConfigPath) ? readFileSync(baseConfigPath, "utf8") : "";
  const withoutPublishSection = stripTomlSection(
    existingConfig,
    `[mcp_servers.${PUBLISH_IMAGES_TO_CHAT_MCP_SERVER_NAME}]`,
  );
  const nextConfig = `${withoutPublishSection.trimEnd()}${
    withoutPublishSection.trim().length > 0 ? "\n\n" : ""
  }${buildPublishImagesToChatMcpSection({
    command: input.publishServerCommand,
    args: input.publishServerArgs,
  })}\n`;
  writeFileSync(overlayConfigPath, nextConfig, "utf8");

  return overlayHomePath;
}

/**
 * Check whether a diagram tool MCP server is configured in the codex config.toml.
 */
export function isDiagramToolMcpEnabled(
  integration: DiagramToolIntegrationId,
  codexHomePath?: string,
): boolean {
  const { serverName } = getInstallableDiagramToolDefinition(integration);
  const configPath = resolveCodexConfigPath(codexHomePath);
  try {
    const content = readFileSync(configPath, "utf8");
    return content.includes(`[mcp_servers.${serverName}]`);
  } catch {
    return false;
  }
}

function upsertSectionNumberField(
  content: string,
  sectionHeader: string,
  fieldName: string,
  value: number,
): string {
  const sectionStart = content.indexOf(sectionHeader);
  if (sectionStart === -1) {
    return content;
  }

  const sectionContentStart = sectionStart + sectionHeader.length;
  const nextSectionRelativeIndex = content.slice(sectionContentStart).search(/\n\[/);
  const sectionEnd =
    nextSectionRelativeIndex === -1
      ? content.length
      : sectionContentStart + nextSectionRelativeIndex + 1;
  const sectionBody = content.slice(sectionContentStart, sectionEnd);
  const fieldPattern = new RegExp(`(^${fieldName}\\s*=\\s*)\\d+`, "m");

  if (fieldPattern.test(sectionBody)) {
    return (
      content.slice(0, sectionContentStart) +
      sectionBody.replace(fieldPattern, `$1${value}`) +
      content.slice(sectionEnd)
    );
  }

  const normalizedSectionBody = sectionBody.startsWith("\n") ? sectionBody : `\n${sectionBody}`;
  const trimmedSectionBody = normalizedSectionBody.replace(/\n*$/, "\n");
  return (
    content.slice(0, sectionContentStart) +
    `${trimmedSectionBody}${fieldName} = ${value}\n` +
    content.slice(sectionEnd)
  );
}

function applyDiagramToolConfigPatches(
  integration: DiagramToolIntegrationId,
  codexHomePath?: string,
): void {
  const definition = getInstallableDiagramToolDefinition(integration);
  if (definition.startupTimeoutSec === undefined) {
    return;
  }

  const configPath = resolveCodexConfigPath(codexHomePath);
  const sectionHeader = `[mcp_servers.${definition.serverName}]`;

  try {
    const content = readFileSync(configPath, "utf8");
    const nextContent = upsertSectionNumberField(
      content,
      sectionHeader,
      "startup_timeout_sec",
      definition.startupTimeoutSec,
    );
    if (nextContent !== content) {
      writeFileSync(configPath, nextContent, "utf8");
    }
  } catch {
    // Ignore patching failures here and let the caller continue with the MCP add/remove result.
  }
}

/**
 * Enable or disable a diagram tool MCP server using the codex CLI.
 * Returns the new enabled state.
 */
export function setDiagramToolMcpEnabled(
  integration: DiagramToolIntegrationId,
  enabled: boolean,
  codexBinaryPath?: string,
): boolean {
  const definition = getInstallableDiagramToolDefinition(integration);
  const binary = codexBinaryPath || "codex";

  if (enabled) {
    if (isDiagramToolMcpEnabled(integration)) {
      applyDiagramToolConfigPatches(integration);
      return true;
    }
    const commandArgs =
      definition.transport === "streamable-http"
        ? ["mcp", "add", definition.serverName, "--url", definition.url]
        : ["mcp", "add", definition.serverName, "--", definition.command, ...definition.args];
    const result = spawnSync(binary, commandArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });
    if (result.status !== 0) {
      const message = result.stderr?.trim() || result.stdout?.trim() || "Unknown error";
      throw new Error(`Failed to add ${definition.title}: ${message}`);
    }
    applyDiagramToolConfigPatches(integration);
    return true;
  }

  if (!isDiagramToolMcpEnabled(integration)) {
    return false;
  }
  const result = spawnSync(binary, ["mcp", "remove", definition.serverName], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || "Unknown error";
    throw new Error(`Failed to remove ${definition.title}: ${message}`);
  }
  return false;
}
