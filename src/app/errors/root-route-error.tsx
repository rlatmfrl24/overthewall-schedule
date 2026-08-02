import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

export const RootRouteError = ({ error, reset }: ErrorComponentProps) => {
  useEffect(() => {
    console.error("[router] rendering failed", error);
  }, [error]);

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-6 font-sans">
      <section
        data-nosnippet
        aria-live="assertive"
        className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm"
      >
        <h1 className="text-xl font-semibold">페이지를 불러오지 못했습니다</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          잠시 후 다시 시도해 주세요. 문제가 계속되면 홈으로 이동해 주세요.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            다시 시도
          </button>
          <Link
            to="/"
            className="rounded-md border px-4 py-2 text-sm"
          >
            홈으로 이동
          </Link>
        </div>
      </section>
    </main>
  );
};
