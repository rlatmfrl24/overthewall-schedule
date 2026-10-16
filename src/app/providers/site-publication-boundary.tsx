import { useAuth } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { apiRoutes } from "@contracts/api-routes";
import type { SitePublicationStatus } from "@contracts/site-publication";
import { apiFetch } from "@/shared/api/client";
import { site } from "@/shared/config/site";
import { SiteCountdown } from "@/app/layout/site-countdown";

export function SitePublicationBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, sessionId } = useAuth();
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["site-publication", site.id, sessionId ?? null],
    queryFn: async ({ signal }) => {
      const value = await apiFetch<SitePublicationStatus>(apiRoutes.publication.status.build(), { signal, cache: "no-store" });
      return { ...value, receivedAt: performance.now() };
    },
    enabled: isLoaded,
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
    refetchInterval: query => query.state.data?.phase === "held" ? 30_000 : false,
    retry: false,
  });
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(performance.now()), 1000); return () => window.clearInterval(timer); }, []);
  const data = status.data;
  const serverNow = data ? Date.parse(data.serverNow) + Math.max(0, now - data.receivedAt) : now;
  const remainingMs = data ? Date.parse(data.opensAt) - serverNow : 0;
  const [cutover, setCutover] = useState<"pending" | "refreshing" | "ready" | "error">("pending");
  const needsCutover = Boolean(data && remainingMs <= 0 && cutover !== "ready");
  useEffect(() => {
    if (!data || remainingMs > 0 || cutover !== "pending") return;
    setCutover("refreshing");
    // A pre-cutover tab must discard its content before refetching the new policy.
    void client.cancelQueries({ predicate: query => query.queryKey[0] !== "site-publication" }).then(() => {
      client.removeQueries({ predicate: query => query.queryKey[0] !== "site-publication" });
      return status.refetch();
    }).then(result => {
      setCutover(result.isError ? "error" : "ready");
    });
  }, [client, cutover, data, remainingMs, status]);
  if (!isLoaded || (!data && status.isPending) || (needsCutover && cutover !== "error")) return <div role="status" className="grid min-h-dvh place-items-center">불러오는 중…</div>;
  if (!data || cutover === "error") return <main className="grid min-h-dvh place-items-center text-center"><div><p>공개 상태를 확인하지 못했습니다.</p><button onClick={() => { if (cutover === "error") setCutover("pending"); else void status.refetch(); }} className="mt-4 underline">다시 확인</button></div></main>;
  if (data.phase !== "open" && !data.canPreview) return <SiteCountdown phase={data.phase} remainingMs={remainingMs} />;
  return <Fragment key={cutover}>{children}</Fragment>;
}
