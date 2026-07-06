import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ContentPageShellProps = {
  title: string;
  leadingIcon?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  headerInnerClassName?: string;
  contentClassName?: string;
};

export function ContentPageShell({
  title,
  leadingIcon,
  actions,
  controls,
  children,
  className,
  headerClassName,
  headerInnerClassName,
  contentClassName,
}: ContentPageShellProps) {
  return (
    <main
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <header
        className={cn(
          "z-20 flex min-h-16 shrink-0 border-b border-sidebar-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:h-16",
          headerClassName,
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-screen-2xl flex-col justify-center gap-3 px-3 py-2 sm:px-5 lg:h-full lg:min-h-0 lg:px-7 lg:py-0 xl:px-8",
            headerInnerClassName,
          )}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {leadingIcon ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card shadow-sm">
                  {leadingIcon}
                </div>
              ) : null}
              <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {title}
              </h1>
            </div>

            {actions ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                {actions}
              </div>
            ) : null}
          </div>

          {controls}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className={cn(
            "mx-auto flex min-w-0 w-full max-w-screen-2xl flex-col gap-5 px-3 pb-10 pt-5 sm:px-5 lg:px-7 xl:px-8",
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
