import type { DiagramToolIntegrationId } from "@t3tools/contracts";

interface InstallableDiagramToolDefinitionBase {
  id: DiagramToolIntegrationId;
  title: string;
  description: string;
  sourceUrl: string;
  installKind: "mcp";
  serverName: string;
  startupTimeoutSec?: number;
  settingsKey:
    | "drawioMcpEnabled"
    | "mermaidMcpEnabled"
    | "plantumlMcpEnabled"
    | "graphvizMcpEnabled"
    | "excalidrawMcpEnabled";
  note?: string;
}

export interface StdioDiagramToolDefinition extends InstallableDiagramToolDefinitionBase {
  transport: "stdio";
  command: string;
  args: readonly string[];
}

export interface UrlDiagramToolDefinition extends InstallableDiagramToolDefinitionBase {
  transport: "streamable-http";
  url: string;
}

export type InstallableDiagramToolDefinition =
  | StdioDiagramToolDefinition
  | UrlDiagramToolDefinition;

export type DiagramToolDefinition = InstallableDiagramToolDefinition;

export interface DiagramToolEnabledSettings {
  readonly drawioMcpEnabled?: boolean;
  readonly mermaidMcpEnabled?: boolean;
  readonly plantumlMcpEnabled?: boolean;
  readonly graphvizMcpEnabled?: boolean;
  readonly excalidrawMcpEnabled?: boolean;
}

export const DIAGRAM_TOOL_DEFINITIONS: readonly DiagramToolDefinition[] = [
  {
    id: "drawio",
    title: "Draw.io diagrams",
    description:
      "Install the draw.io MCP server so the assistant can create and edit draw.io diagrams.",
    sourceUrl: "https://www.npmjs.com/package/@drawio/mcp",
    installKind: "mcp",
    serverName: "drawio",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@drawio/mcp"],
    settingsKey: "drawioMcpEnabled",
  },
  {
    id: "mermaid",
    title: "Mermaid diagrams",
    description:
      "Install a Mermaid MCP server that renders Mermaid diagrams locally with Chromium.",
    sourceUrl: "https://www.npmjs.com/package/@mermaidjs-mcp/mermaidjs-mcp",
    installKind: "mcp",
    serverName: "mermaid",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@mermaidjs-mcp/mermaidjs-mcp"],
    startupTimeoutSec: 45,
    settingsKey: "mermaidMcpEnabled",
    note: "First use may download Chromium through Puppeteer, so the installer also sets a longer startup timeout.",
  },
  {
    id: "plantuml",
    title: "PlantUML diagrams",
    description:
      "Install the PlantUML MCP server for sequence, class, architecture, and other UML diagrams.",
    sourceUrl: "https://www.npmjs.com/package/plantuml-mcp-server",
    installKind: "mcp",
    serverName: "plantuml",
    transport: "stdio",
    command: "npx",
    args: ["-y", "plantuml-mcp-server"],
    settingsKey: "plantumlMcpEnabled",
    note: "Uses the public PlantUML server by default unless you override its environment variables.",
  },
  {
    id: "graphviz",
    title: "Graphviz diagrams",
    description:
      "Install a Kroki-backed MCP server that can render Graphviz DOT diagrams for the assistant.",
    sourceUrl: "https://www.npmjs.com/package/@tkoba1974/mcp-kroki",
    installKind: "mcp",
    serverName: "graphviz",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@tkoba1974/mcp-kroki"],
    settingsKey: "graphvizMcpEnabled",
    note: "This path uses Kroki.io and also supports Mermaid, PlantUML, and other text-based diagram formats.",
  },
  {
    id: "excalidraw",
    title: "Excalidraw diagrams",
    description:
      "Install the hosted Excalidraw MCP endpoint so the assistant can create and edit Excalidraw diagrams.",
    sourceUrl: "https://mcp.excalidraw.com/",
    installKind: "mcp",
    serverName: "excalidraw",
    transport: "streamable-http",
    url: "https://mcp.excalidraw.com/mcp",
    settingsKey: "excalidrawMcpEnabled",
    note: "Uses Excalidraw's hosted MCP endpoint instead of a local npm server.",
  },
];

export const INSTALLABLE_DIAGRAM_TOOL_DEFINITIONS = DIAGRAM_TOOL_DEFINITIONS.filter(
  (definition): definition is InstallableDiagramToolDefinition => definition.installKind === "mcp",
);

const DIAGRAM_RESPONSE_STYLE_GUIDANCE = [
  "Before drawing, inspect the repo or source material enough to ground the diagrams in the real architecture instead of generic patterns.",
  "After generating the diagrams, answer with a concise structure: a one-sentence summary, a short `Diagrams:` list of titled diagrams, then a `What they show:` section with compact bullets tied to concrete modules, routes, or entrypoints.",
  "Do not paste Mermaid source, draw.io XML/CSV, or other diagram model text into the final chat response unless the user explicitly asks for that source.",
  "Keep editor URLs or source links as secondary context after the explanation, not as the primary deliverable.",
].join("\n");

const DIAGRAM_PROVIDER_DEVELOPER_INSTRUCTIONS: Record<DiagramToolIntegrationId, string> = {
  drawio: [
    "Diagram tool preference: draw.io.",
    "If this turn requires creating or editing a diagram, use the installed drawio MCP server.",
    "Generate or refine diagrams privately as needed. Only share a final user-facing image after exporting it to a local PNG and calling `publish_images_to_chat` with the selected file path.",
    "Do not publish intermediate diagram images. Only publish the image files you want the user to see in chat.",
    DIAGRAM_RESPONSE_STYLE_GUIDANCE,
    "Prefer editable draw.io output and do not switch to Mermaid, PlantUML, Graphviz, or Excalidraw unless the user explicitly asks to change diagram tools.",
  ].join("\n"),
  mermaid: [
    "Diagram tool preference: Mermaid.",
    "If this turn requires creating or editing a diagram, use the installed mermaid MCP server and Mermaid-based output.",
    "Generate or refine diagrams privately as needed. Only share a final user-facing image after exporting it to a local PNG and calling `publish_images_to_chat` with the selected file path.",
    "Do not publish intermediate diagram images. Only publish the image files you want the user to see in chat.",
    DIAGRAM_RESPONSE_STYLE_GUIDANCE,
    "Do not use draw.io or the drawio-diagrams skill for this request unless the user explicitly asks to switch back to draw.io.",
  ].join("\n"),
  plantuml: [
    "Diagram tool preference: PlantUML.",
    "If this turn requires creating or editing a diagram, use the installed plantuml MCP server and PlantUML-based output.",
    "Generate or refine diagrams privately as needed. Only share a final user-facing image after exporting it to a local PNG and calling `publish_images_to_chat` with the selected file path.",
    "Do not publish intermediate diagram images. Only publish the image files you want the user to see in chat.",
    DIAGRAM_RESPONSE_STYLE_GUIDANCE,
    "Do not use draw.io or the drawio-diagrams skill for this request unless the user explicitly asks to switch back to draw.io.",
  ].join("\n"),
  graphviz: [
    "Diagram tool preference: Graphviz.",
    "If this turn requires creating or editing a diagram, use the installed graphviz MCP server and Graphviz or Kroki-compatible text-diagram output.",
    "Generate or refine diagrams privately as needed. Only share a final user-facing image after exporting it to a local PNG and calling `publish_images_to_chat` with the selected file path.",
    "Do not publish intermediate diagram images. Only publish the image files you want the user to see in chat.",
    DIAGRAM_RESPONSE_STYLE_GUIDANCE,
    "Do not use draw.io or the drawio-diagrams skill for this request unless the user explicitly asks to switch back to draw.io.",
  ].join("\n"),
  excalidraw: [
    "Diagram tool preference: Excalidraw.",
    "If this turn requires creating or editing a diagram, use the installed excalidraw MCP server and prefer sketch-style Excalidraw output.",
    "Generate or refine diagrams privately as needed. Only share a final user-facing image after exporting it to a local PNG and calling `publish_images_to_chat` with the selected file path.",
    "Do not publish intermediate diagram images. Only publish the image files you want the user to see in chat.",
    DIAGRAM_RESPONSE_STYLE_GUIDANCE,
    "Do not use draw.io or the drawio-diagrams skill for this request unless the user explicitly asks to switch back to draw.io.",
  ].join("\n"),
};

export function getDiagramToolDefinition(id: DiagramToolIntegrationId): DiagramToolDefinition {
  const definition = DIAGRAM_TOOL_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown diagram tool integration: ${id}`);
  }
  return definition;
}

export function getInstallableDiagramToolDefinition(
  id: DiagramToolIntegrationId,
): InstallableDiagramToolDefinition {
  const definition = getDiagramToolDefinition(id);
  return definition;
}

export function isDiagramToolEnabled(
  settings: DiagramToolEnabledSettings,
  id: DiagramToolIntegrationId,
): boolean {
  return Boolean(settings[getInstallableDiagramToolDefinition(id).settingsKey]);
}

export function getEnabledDiagramToolDefinitions(
  settings: DiagramToolEnabledSettings,
): InstallableDiagramToolDefinition[] {
  return INSTALLABLE_DIAGRAM_TOOL_DEFINITIONS.filter((definition) =>
    isDiagramToolEnabled(settings, definition.id),
  );
}

export function buildDiagramProviderDeveloperInstructions(id: DiagramToolIntegrationId): string {
  return DIAGRAM_PROVIDER_DEVELOPER_INSTRUCTIONS[id];
}
