import { Link } from "@tanstack/react-router";

export const RootNotFound = () => (
  <main className="grid min-h-[100dvh] place-items-center bg-background px-6 font-sans">
    <section className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        주소를 확인하거나 오버더월 홈으로 이동해 주세요.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        홈으로 이동
      </Link>
    </section>
  </main>
);
