import { LayoutGrid, LayoutList, TableProperties } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ButtonGroup } from "@/shared/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { CatalogView } from "../../model/use-catalog-view";

export function CatalogViewSelector({ view, onChange }: { view: CatalogView; onChange: (view: CatalogView) => void }) {
  return <ButtonGroup aria-label="보기 방식">
    {([
      { value: "card", label: "카드", icon: LayoutList },
      { value: "table", label: "표 리스트", icon: TableProperties },
      { value: "grid", label: "그리드", icon: LayoutGrid },
    ] as const).map(({ value, label, icon: Icon }) => <Tooltip key={value}>
      <TooltipTrigger asChild><Button type="button" size="icon" variant={view === value ? "default" : "outline"}
        className="max-sm:size-11" aria-label={label} aria-pressed={view === value} onClick={() => onChange(value)}>
        <Icon aria-hidden="true" />
      </Button></TooltipTrigger><TooltipContent>{label}</TooltipContent>
    </Tooltip>)}
  </ButtonGroup>;
}
