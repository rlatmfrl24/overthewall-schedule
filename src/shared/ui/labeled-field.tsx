import { useId, type ReactNode, type ComponentProps } from "react";
import { FieldDescription, FieldError, FieldLabel } from "./field";
import { cn } from "@/shared/lib/utils";

type ControlProps = Pick<ComponentProps<"input">, "id" | "aria-describedby" | "aria-invalid">;

/** A render child receives the label/error bindings; node children can group richer editors. */
export function LabeledField({ label, htmlFor, description, children, error, className, hideLabel = false }: {
  label: string; htmlFor?: string; description?: string; children: ReactNode | ((props: ControlProps) => ReactNode); error?: string; className?: string; hideLabel?: boolean;
}) {
  const id = useId();
  const single = typeof children === "function";
  const controlId = htmlFor ?? `${id}-control`;
  const describedBy = [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return <div role={htmlFor || single ? undefined : "group"} aria-labelledby={htmlFor || single ? undefined : `${id}-label`} aria-describedby={single ? undefined : describedBy} className={cn("space-y-1.5", className)}>
    <FieldLabel id={`${id}-label`} htmlFor={single ? controlId : htmlFor} className={hideLabel ? "sr-only" : undefined}>{label}</FieldLabel>
    {single ? children({ id: controlId, "aria-describedby": describedBy, "aria-invalid": Boolean(error) || undefined }) : children}
    {description && <FieldDescription id={`${id}-description`} className="text-xs leading-relaxed">{description}</FieldDescription>}
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </div>;
}
