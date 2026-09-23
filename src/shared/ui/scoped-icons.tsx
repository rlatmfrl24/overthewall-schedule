import type { ComponentProps } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { PiCheckBold, PiCaretDownBold, PiCaretUpBold, PiXBold } from "react-icons/pi";
import { useUiScopeClassName } from "@/shared/lib/ui-scope";

export function CheckIcon(props: ComponentProps<typeof Check>) {
  const Icon = useUiScopeClassName() === "admin-console" ? PiCheckBold : Check;
  return <Icon {...props} />;
}
export function ChevronDownIcon(props: ComponentProps<typeof ChevronDown>) {
  const Icon = useUiScopeClassName() === "admin-console" ? PiCaretDownBold : ChevronDown;
  return <Icon {...props} />;
}
export function ChevronUpIcon(props: ComponentProps<typeof ChevronUp>) {
  const Icon = useUiScopeClassName() === "admin-console" ? PiCaretUpBold : ChevronUp;
  return <Icon {...props} />;
}
export function XIcon(props: ComponentProps<typeof X>) {
  const Icon = useUiScopeClassName() === "admin-console" ? PiXBold : X;
  return <Icon {...props} />;
}
