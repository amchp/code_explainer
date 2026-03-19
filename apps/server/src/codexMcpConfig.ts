import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DRAWIO_MCP_SERVER_NAME = "drawio";
const DRAWIO_MCP_SECTION_HEADER = "[mcp_servers.drawio]";

/**
 * Resolve the path to the codex config.toml file.
 * Uses CODEX_HOME env var if set, otherwise ~/.codex.
 */
export function resolveCodexConfigPath(codexHomePath?: string): string {
  const codexHome = codexHomePath || process.env.CODEX_HOME || path.join(homedir(), ".codex");
  return path.join(codexHome, "config.toml");
}

/**
 * Check whether draw.io MCP is configured in the codex config.toml.
 */
export function isDrawioMcpEnabled(codexHomePath?: string): boolean {
  const configPath = resolveCodexConfigPath(codexHomePath);
  try {
    const content = readFileSync(configPath, "utf8");
    return content.includes(DRAWIO_MCP_SECTION_HEADER);
  } catch {
    return false;
  }
}

/**
 * Enable or disable the draw.io MCP server using the codex CLI.
 * Returns the new enabled state.
 */
export function setDrawioMcpEnabled(
  enabled: boolean,
  codexBinaryPath?: string,
): boolean {
  const binary = codexBinaryPath || "codex";

  if (enabled) {
    if (isDrawioMcpEnabled()) {
      return true;
    }
    const result = spawnSync(
      binary,
      ["mcp", "add", DRAWIO_MCP_SERVER_NAME, "--", "npx", "-y", "@drawio/mcp"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      },
    );
    if (result.status !== 0) {
      const message = result.stderr?.trim() || result.stdout?.trim() || "Unknown error";
      throw new Error(`Failed to add draw.io MCP server: ${message}`);
    }
    return true;
  }

  if (!isDrawioMcpEnabled()) {
    return false;
  }
  const result = spawnSync(
    binary,
    ["mcp", "remove", DRAWIO_MCP_SERVER_NAME],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    },
  );
  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || "Unknown error";
    throw new Error(`Failed to remove draw.io MCP server: ${message}`);
  }
  return false;
}
