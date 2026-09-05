import { useEffect, useState } from "react";
export function QueryReadback({ updatedAt, fetching, error }: { updatedAt: number; fetching?: boolean; error?: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  return <p role={error ? "alert" : "status"} className={error ? "my-2 text-sm text-destructive" : "my-2 text-xs text-muted-foreground"}>
    {error ? "조회 실패 · 이전 정보가 표시될 수 있습니다. 다시 조회해 주세요." : fetching ? "최신 상태 확인 중…" : !updatedAt ? "아직 확인되지 않았습니다." : now - updatedAt > 300_000 ? "5분 이상 지난 정보 · " : "확인 완료 · "}
    {updatedAt > 0 && <time dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleString("ko-KR")}</time>}
  </p>;
}
