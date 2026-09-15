import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { createOtwPlayYouTubePlayer, type OtwPlayYouTubePlayer } from "../../player/youtube-iframe-api";

export function ReviewSegmentPlayer({ videoId, startSeconds, endSeconds, thumbnailUrl, valid }: {
  videoId: string;
  startSeconds: number;
  endSeconds: number | null;
  thumbnailUrl: string | null;
  valid: boolean;
}) {
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("대기");
  const [time, setTime] = useState(startSeconds);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<OtwPlayYouTubePlayer | null>(null);
  useEffect(() => {
    if (!started || !valid || !host.current) return;
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const element = document.createElement("div");
    host.current.append(element);
    const timeout = setTimeout(() => { if (!disposed) setStatus("플레이어 연결이 지연됩니다. 다시 시도해 주세요."); }, 30_000);
    void createOtwPlayYouTubePlayer(element, {
      onStateChange: state => {
        if (!disposed) setStatus(state === "playing" ? "재생 중" : state === "paused" ? "일시정지" : state === "ended" ? "구간 재생 완료" : "불러오는 중");
      },
      onError: code => { if (!disposed) setStatus(`YouTube 재생 오류 (${code}). 영상 접근 가능 여부를 확인해 주세요.`); },
      onAutoplayBlocked: () => { if (!disposed) setStatus("재생 계속 버튼을 눌러 주세요."); },
    }).then(controller => {
      clearTimeout(timeout);
      if (disposed) { controller.destroy(); return; }
      player.current = controller;
      controller.load({ videoId, startSeconds, ...(endSeconds === null ? {} : { endSeconds }) });
      timer = setInterval(() => {
        const now = controller.getCurrentTime();
        setTime(endSeconds === null ? now : Math.min(now, endSeconds));
        if (endSeconds !== null && now >= endSeconds) {
          controller.pause();
          setStatus("구간 재생 완료");
        }
      }, 250);
    }).catch(() => { clearTimeout(timeout); if (!disposed) setStatus("플레이어를 불러오지 못했습니다. 다시 시도해 주세요."); });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      clearInterval(timer);
      player.current?.destroy();
      player.current = null;
      element.remove();
    };
  }, [started, valid, videoId, startSeconds, endSeconds]);
  const restart = (from = startSeconds) => {
    if (!player.current) { setStarted(false); return; }
    setTime(from);
    player.current.load({ videoId, startSeconds: from, ...(endSeconds === null ? {} : { endSeconds }) });
  };
  return <div className="space-y-3" aria-label="검수 구간 재생">
    <div className="aspect-video overflow-hidden rounded-xl bg-muted">
      {started ? <div ref={host} className="h-full w-full" /> : thumbnailUrl ? <img src={thumbnailUrl} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">영상 미리보기</div>}
    </div>
    <div className="flex flex-wrap gap-2">
      {!started ? <Button type="button" disabled={!valid} onClick={() => { setStatus("불러오는 중"); setStarted(true); }}><Play /> 지정 구간 재생</Button> : <>
        <Button type="button" variant="outline" onClick={() => restart()}><RotateCcw /> 구간 처음부터</Button>
        <Button type="button" variant="outline" onClick={() => {
          if (status === "재생 중") player.current?.pause();
          else if (status === "구간 재생 완료") restart();
          else player.current?.play();
        }}>{status === "재생 중" ? <><Pause /> 일시정지</> : <><Play /> 재생 계속</>}</Button>
        {endSeconds !== null && <Button type="button" variant="outline" onClick={() => restart(Math.max(startSeconds, endSeconds - 5))}>종료 5초 전부터</Button>}
      </>}
    </div>
    {started && <p role="status" className="text-xs text-muted-foreground">{status} · 원본 영상 {Math.floor(time)}초</p>}
    <p className="text-xs text-muted-foreground">{valid ? "지정한 종료 위치에서 멈춥니다. 구간을 수정하면 재생이 초기화됩니다." : "올바른 시작·종료 위치를 입력한 뒤 재생하세요."}</p>
  </div>;
}
