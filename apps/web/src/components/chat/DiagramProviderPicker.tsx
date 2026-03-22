import { type DiagramToolIntegrationId } from "@t3tools/contracts";
import { type InstallableDiagramToolDefinition } from "@t3tools/shared/diagramTools";
import { memo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Menu, MenuGroup, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { cn } from "~/lib/utils";

export const DiagramProviderPicker = memo(function DiagramProviderPicker(props: {
  installedDiagramTools: ReadonlyArray<InstallableDiagramToolDefinition>;
  selectedDiagramProvider: DiagramToolIntegrationId | null;
  compact?: boolean;
  disabled?: boolean;
  onDiagramProviderChange: (provider: DiagramToolIntegrationId) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (props.installedDiagramTools.length === 0) {
    return null;
  }

  const selectedDefinition =
    props.installedDiagramTools.find(
      (definition) => definition.id === props.selectedDiagramProvider,
    ) ?? null;
  const selectedLabel = selectedDefinition?.title ?? "Diagram tool";

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setIsMenuOpen(false);
          return;
        }
        setIsMenuOpen(open);
      }}
    >
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "min-w-0 justify-start overflow-hidden whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80",
              props.compact ? "max-w-40 shrink-0" : "max-w-48 shrink sm:max-w-56 sm:px-3",
            )}
            disabled={props.disabled}
          />
        }
      >
        <span
          className={cn(
            "flex min-w-0 w-full items-center gap-2 overflow-hidden",
            props.compact ? "max-w-36" : undefined,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
        </span>
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>
          <MenuRadioGroup
            value={props.selectedDiagramProvider ?? ""}
            onValueChange={(value) => {
              if (props.disabled || !value) {
                return;
              }
              const selected = props.installedDiagramTools.find(
                (definition) => definition.id === value,
              );
              if (!selected) {
                return;
              }
              props.onDiagramProviderChange(selected.id);
              setIsMenuOpen(false);
            }}
          >
            {props.installedDiagramTools.map((definition) => (
              <MenuRadioItem
                key={definition.id}
                value={definition.id}
                onClick={() => setIsMenuOpen(false)}
              >
                {definition.title}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});
