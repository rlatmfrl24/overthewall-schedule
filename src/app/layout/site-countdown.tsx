import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";

export function SiteCountdown({ phase, remainingMs }: { phase: "countdown" | "held"; remainingMs: number }) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const values = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  const units = ["일", "시간", "분", "초"];
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 text-center text-foreground">
      <img src="/logo_luvdia.webp" alt="LuvDia Schedule" className="h-20 w-auto" />
      <div className="space-y-3">
        <p className="text-sm tracking-wide text-muted-foreground">LuvDia Schedule</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">{phase === "held" ? "공개 준비를 마무리하고 있습니다." : "곧 만나요"}</h1>
        <p className="text-muted-foreground">2026년 10월 19일 오전 0시 공개</p>
        <p className="text-xs text-muted-foreground">한국 시간 기준</p>
      </div>
      {phase === "countdown" && <div className="flex gap-5 sm:gap-8" aria-label={`공개까지 ${values.map((value, i) => `${value}${units[i]}`).join(" ")}`}>
        {values.map((value, i) => <div key={units[i]} aria-hidden="true"><div className="text-3xl font-medium tabular-nums sm:text-5xl">{String(value).padStart(2, "0")}</div><div className="mt-2 text-xs text-muted-foreground">{units[i]}</div></div>)}
      </div>}
      <div className="text-sm text-muted-foreground">
        <SignedOut><SignInButton mode="modal"><button className="underline underline-offset-4">관리자 로그인</button></SignInButton></SignedOut>
        <SignedIn><p>공개 전에는 관리자만 이용할 수 있습니다.</p></SignedIn>
      </div>
      <p className="text-xs text-muted-foreground">비공식 팬 운영 서비스</p>
    </main>
  );
}
