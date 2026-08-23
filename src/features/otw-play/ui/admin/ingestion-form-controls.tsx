import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type ChoiceGroupProps<T extends string> = {
  label: string;
  description?: string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly ChoiceOption<T>[];
  presentation?: "cards" | "pills";
  className?: string;
};

export function ChoiceGroup<T extends string>({
  label,
  description,
  value,
  onValueChange,
  options,
  presentation = "pills",
  className,
}: ChoiceGroupProps<T>) {
  const name = useId();

  return (
    <fieldset className={cn("space-y-3", className)}>
      <legend className="text-sm font-semibold leading-none">{label}</legend>
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div
        className={cn(
          presentation === "cards"
            ? "grid gap-2 lg:grid-cols-3"
            : "flex flex-wrap gap-2",
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "relative cursor-pointer transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                presentation === "cards"
                  ? "flex min-h-20 items-start gap-3 rounded-lg border bg-background p-3 hover:bg-muted/50"
                  : "inline-flex min-h-9 items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm hover:bg-muted/50",
                selected &&
                  "border-primary bg-primary/5 text-foreground shadow-xs dark:bg-primary/10",
              )}
            >
              <input
                className="sr-only"
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onValueChange(option.value)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{option.label}</span>
                {option.description ? (
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {selected ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground",
                    presentation === "pills" && "size-4",
                  )}
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
