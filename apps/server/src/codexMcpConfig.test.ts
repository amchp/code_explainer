import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildPublishImagesToChatMcpSection,
  createCodexHomeOverlay,
  isDiagramToolMcpEnabled,
  PUBLISH_IMAGES_TO_CHAT_MCP_SERVER_NAME,
  resolveCodexConfigPath,
  setDiagramToolMcpEnabled,
} from "./codexMcpConfig";

describe("codexMcpConfig", () => {
  let tmpDir: string;
  let previousCodexHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "codex-mcp-config-test-"));
    previousCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = tmpDir;
  });

  afterEach(() => {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("resolveCodexConfigPath", () => {
    it("uses the provided codex home path", () => {
      expect(resolveCodexConfigPath("/custom/codex")).toBe("/custom/codex/config.toml");
    });
  });

  describe("isDiagramToolMcpEnabled", () => {
    it("returns false when config does not exist", () => {
      expect(isDiagramToolMcpEnabled("drawio", path.join(tmpDir, "nonexistent"))).toBe(false);
    });

    it("returns false when config exists but has no drawio section", () => {
      writeFileSync(path.join(tmpDir, "config.toml"), 'model = "gpt-5.4"\n', "utf8");
      expect(isDiagramToolMcpEnabled("drawio", tmpDir)).toBe(false);
    });

    it("returns true when config has drawio MCP section", () => {
      writeFileSync(
        path.join(tmpDir, "config.toml"),
        'model = "gpt-5.4"\n\n[mcp_servers.drawio]\ncommand = "npx"\nargs = ["-y", "@drawio/mcp"]\n',
        "utf8",
      );
      expect(isDiagramToolMcpEnabled("drawio", tmpDir)).toBe(true);
    });

    it("uses each integration server name when checking config", () => {
      writeFileSync(
        path.join(tmpDir, "config.toml"),
        'model = "gpt-5.4"\n\n[mcp_servers.graphviz]\ncommand = "npx"\nargs = ["-y", "@tkoba1974/mcp-kroki"]\n',
        "utf8",
      );
      expect(isDiagramToolMcpEnabled("graphviz", tmpDir)).toBe(true);
      expect(isDiagramToolMcpEnabled("plantuml", tmpDir)).toBe(false);
    });

    it("detects URL-based integrations", () => {
      writeFileSync(
        path.join(tmpDir, "config.toml"),
        '[mcp_servers.excalidraw]\nurl = "https://mcp.excalidraw.com/mcp"\n',
        "utf8",
      );
      expect(isDiagramToolMcpEnabled("excalidraw", tmpDir)).toBe(true);
    });
  });

  describe("setDiagramToolMcpEnabled", () => {
    it("patches mermaid startup timeout when mermaid is already installed", () => {
      writeFileSync(
        path.join(tmpDir, "config.toml"),
        '[mcp_servers.mermaid]\ncommand = "npx"\nargs = ["-y", "@mermaidjs-mcp/mermaidjs-mcp"]\n',
        "utf8",
      );

      expect(setDiagramToolMcpEnabled("mermaid", true)).toBe(true);

      const updated = readFileSync(path.join(tmpDir, "config.toml"), "utf8");
      expect(updated).toContain("startup_timeout_sec = 45");
    });
  });

  describe("createCodexHomeOverlay", () => {
    it("copies the base config and injects the publish-chat MCP server", () => {
      writeFileSync(path.join(tmpDir, "config.toml"), 'model = "gpt-5.4"\n', "utf8");

      const overlayHome = createCodexHomeOverlay({
        threadId: "thread-1",
        stateDir: tmpDir,
        baseHomePath: tmpDir,
        publishServerCommand: process.execPath,
        publishServerArgs: ["/app/dist/index.mjs", "publish-chat-image-mcp"],
      });

      const overlayConfig = readFileSync(path.join(overlayHome, "config.toml"), "utf8");
      expect(overlayConfig).toContain('model = "gpt-5.4"');
      expect(overlayConfig).toContain(`[mcp_servers.${PUBLISH_IMAGES_TO_CHAT_MCP_SERVER_NAME}]`);
      expect(overlayConfig).toContain('args = ["/app/dist/index.mjs", "publish-chat-image-mcp"]');
    });
  });

  describe("buildPublishImagesToChatMcpSection", () => {
    it("encodes a stdio MCP server definition", () => {
      expect(
        buildPublishImagesToChatMcpSection({
          command: "node",
          args: ["/app/dist/index.mjs", "publish-chat-image-mcp", "--thread-id", "thread-1"],
        }),
      ).toContain("[mcp_servers.t3_publish_chat_images]");
    });
  });
});
