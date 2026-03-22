import { Schema } from "effect";

export const DiagramToolIntegrationId = Schema.Literals([
  "drawio",
  "mermaid",
  "plantuml",
  "graphviz",
  "excalidraw",
]);
export type DiagramToolIntegrationId = typeof DiagramToolIntegrationId.Type;
