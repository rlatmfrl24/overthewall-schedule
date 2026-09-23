import { Children, type ComponentProps } from "react";
import { PiDotsThreeBold } from "react-icons/pi";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

/** Keep infrequent row actions out of the primary editing path. */
export function SecondaryAction(props: ComponentProps<typeof Button>) {
  const label = props["aria-label"] ?? props.title ?? "추가 작업";
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" disabled={props.disabled} aria-describedby={props["aria-describedby"]} title={props.title} aria-label={`${label} 메뉴`}><PiDotsThreeBold className="size-5" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem asChild disabled={props.disabled}>
        <Button {...props} size="sm" variant="ghost" className="w-full justify-start text-destructive">{props.children}{!Children.toArray(props.children).some(child => typeof child === "string" && child.trim()) && <span>{label}</span>}</Button>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
