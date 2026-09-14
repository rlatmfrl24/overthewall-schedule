import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { useTheme } from "@/app/providers/theme-provider";
import { cn } from "@/shared/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
  { value: "system", label: "시스템", icon: Monitor },
] as const;

export function ModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div role="group" aria-label="테마 선택" className={cn("grid grid-cols-3 gap-1 rounded-lg bg-muted p-1", className)}>
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant="ghost"
          className={cn(
            "h-11 gap-1.5 rounded-md px-1 text-xs",
            theme === value
              ? "bg-background text-foreground shadow-sm hover:bg-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Button>
      ))}
    </div>
  );
}
