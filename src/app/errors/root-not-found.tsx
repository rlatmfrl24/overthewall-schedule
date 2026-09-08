import { Link } from "@tanstack/react-router";
import { Button } from "@/shared/ui/button";

export const RootNotFound = () => (
  <main className="grid min-h-full place-items-center bg-background px-6 py-8 font-sans">
    <section className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        주소를 확인하거나 오버더월 홈으로 이동해 주세요.
      </p>
      <Button asChild className="mt-6"><Link to="/">홈으로 이동</Link></Button>
    </section>
  </main>
);
