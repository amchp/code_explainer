import { describe, expect, it } from "vitest";

import {
  buildDiagramProviderDeveloperInstructions,
  getEnabledDiagramToolDefinitions,
} from "./diagramTools";

describe("getEnabledDiagramToolDefinitions", () => {
  it("returns only enabled diagram integrations", () => {
    expect(
      getEnabledDiagramToolDefinitions({
        drawioMcpEnabled: true,
        mermaidMcpEnabled: false,
        plantumlMcpEnabled: true,
        graphvizMcpEnabled: false,
        excalidrawMcpEnabled: false,
      }).map((definition) => definition.id),
    ).toEqual(["drawio", "plantuml"]);
  });
});

describe("buildDiagramProviderDeveloperInstructions", () => {
  it("mentions the selected installed diagram provider", () => {
    expect(buildDiagramProviderDeveloperInstructions("graphviz")).toContain(
      "Diagram tool preference: Graphviz.",
    );
    expect(buildDiagramProviderDeveloperInstructions("graphviz")).toContain("graphviz");
    expect(buildDiagramProviderDeveloperInstructions("graphviz")).toContain(
      "publish_images_to_chat",
    );
    expect(buildDiagramProviderDeveloperInstructions("graphviz")).toContain("What they show:");
    expect(buildDiagramProviderDeveloperInstructions("graphviz")).toContain(
      "Do not paste Mermaid source",
    );
  });

  it("explicitly blocks the draw.io skill for non-draw.io selections", () => {
    expect(buildDiagramProviderDeveloperInstructions("mermaid")).toContain("drawio-diagrams");
    expect(buildDiagramProviderDeveloperInstructions("mermaid")).toContain("Mermaid");
  });
});
