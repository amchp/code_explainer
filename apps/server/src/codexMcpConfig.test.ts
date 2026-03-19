import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { isDrawioMcpEnabled, resolveCodexConfigPath } from "./codexMcpConfig";

describe("codexMcpConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "codex-mcp-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("resolveCodexConfigPath", () => {
    it("uses the provided codex home path", () => {
      expect(resolveCodexConfigPath("/custom/codex")).toBe("/custom/codex/config.toml");
    });
  });

  describe("isDrawioMcpEnabled", () => {
    it("returns false when config does not exist", () => {
      expect(isDrawioMcpEnabled(path.join(tmpDir, "nonexistent"))).toBe(false);
    });

    it("returns false when config exists but has no drawio section", () => {
      writeFileSync(path.join(tmpDir, "config.toml"), 'model = "gpt-5.4"\n', "utf8");
      expect(isDrawioMcpEnabled(tmpDir)).toBe(false);
    });

    it("returns true when config has drawio MCP section", () => {
      writeFileSync(
        path.join(tmpDir, "config.toml"),
        'model = "gpt-5.4"\n\n[mcp_servers.drawio]\ncommand = "npx"\nargs = ["-y", "@drawio/mcp"]\n',
        "utf8",
      );
      expect(isDrawioMcpEnabled(tmpDir)).toBe(true);
    });
  });
});
