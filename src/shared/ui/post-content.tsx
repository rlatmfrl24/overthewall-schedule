import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Share2, X } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { cn } from "@/shared/lib/utils";

export function PostHeader({ name, profileSrc, accent, source, sourceIcon, secondary, time, dateTime, newPost, appearance = "card" }: {
  name: string; profileSrc?: string; accent?: string; source: string; secondary?: string;
  time: string; dateTime: string; newPost?: boolean; sourceIcon?: ReactNode;
  appearance?: "card" | "feed";
}) {
  if (appearance === "feed") return <div className="flex min-w-0 items-start gap-2.5">
    {profileSrc ? <img src={profileSrc} alt="" className="size-8 shrink-0 rounded-full border object-cover" style={{ borderColor: accent }} /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{source}</span>}
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <h3 className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">{name}</h3>
        <span className="inline-flex shrink-0 items-center text-[11px] text-muted-foreground" title={source === "카페" ? "네이버 카페" : source}>{sourceIcon ?? source}</span>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <time dateTime={dateTime} className="text-[11px] text-muted-foreground" title={new Date(dateTime).toLocaleString("ko-KR")}>{time}</time>
        {newPost && <span className="text-[10px] font-medium text-muted-foreground">새 글</span>}
      </div>
      {secondary && <span className="block truncate text-[11px] text-muted-foreground">{secondary}</span>}
    </div>
  </div>;
  return <div className="flex min-w-0 items-center gap-3">
    {profileSrc ? <img src={profileSrc} alt="" className="size-10 shrink-0 rounded-full border object-cover" style={{ borderColor: accent }} /> : <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm">{source}</span>}
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">{name}</h3>
        <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">{source}</span>
        {newPost && <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">새 글</span>}
      </div>
      <div className="flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
        {secondary && <span className="truncate">{secondary}</span>}
        <time dateTime={dateTime} title={new Date(dateTime).toLocaleString("ko-KR")}>{time}</time>
      </div>
    </div>
  </div>;
}

export function PostText({ children, lines = 5 }: { children: ReactNode; lines?: 3 | 5 }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, expanded]);
  return <div>
    <div id={id} ref={ref} className={cn("whitespace-pre-wrap break-words text-[15px] leading-6 [overflow-wrap:anywhere]", !expanded && (lines === 3 ? "line-clamp-3" : "line-clamp-5"))}>{children}</div>
    {(overflow || expanded) && <Button type="button" variant="ghost" className="min-h-11 px-2 text-sm" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? "접기" : "더보기"}</Button>}
  </div>;
}

async function copyPostUrl(url: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(url);
  const element = document.createElement("textarea");
  element.value = url;
  element.setAttribute("readonly", "");
  element.style.position = "fixed";
  element.style.opacity = "0";
  const focused = document.activeElement;
  document.body.appendChild(element);
  try {
    element.select();
    if (!document.execCommand("copy")) throw new Error("Copy failed");
  } finally {
    element.remove();
    if (focused instanceof HTMLElement) focused.focus();
  }
}

export function PostActions({ url, title, text, children, appearance = "card" }: { url: string; title: string; text?: string; children: ReactNode; appearance?: "card" | "feed" }) {
  const [status, setStatus] = useState("");
  const share = async () => {
    setStatus("");
    try {
      if (navigator.share) {
        try { await navigator.share({ url, title, text }); return; }
        catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
      }
      await copyPostUrl(url);
      setStatus("링크 복사됨");
    } catch { setStatus("링크 복사 실패. 원문 링크를 이용해 주세요."); }
  };
  return <div className={cn("pt-1", appearance === "card" && "border-t border-border/70")}>
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">{children}</div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" className={cn("size-11 p-0", appearance === "feed" && "size-8 max-sm:size-11")} aria-label={`${title} 공유`} title="공유" onClick={() => void share()}><Share2 className={appearance === "feed" ? "size-3.5" : "size-4"} /></Button>
        <Button asChild variant="ghost" className={cn("min-h-11 gap-1.5 px-2 text-xs", appearance === "feed" && "h-8 min-h-8 gap-1 px-1.5 py-1 text-[11px] max-sm:min-h-11")}><a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${title} 원문 보기 (새 탭)`}>원문 보기 <ExternalLink className={appearance === "feed" ? "size-3" : "size-3.5"} /></a></Button>
      </div>
    </div>
    <p role="status" className="text-xs text-muted-foreground">{status}</p>
  </div>;
}

export type PostMediaItem = { src: string; alt: string; kind: "photo" | "video" };

export function PostImage({ item, className }: { item: PostMediaItem; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed || !item.src ? <span className="flex h-full min-h-24 flex-col items-center justify-center gap-2 px-3 text-sm text-muted-foreground"><ImageOff className="size-6" />이미지를 불러오지 못했습니다</span> :
    <img src={item.src} alt={item.alt} loading="lazy" referrerPolicy="no-referrer" className={className} onError={() => setFailed(true)} />;
}

export function PostMedia({ items, title, url }: { items: PostMediaItem[]; title: string; url: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [gallery, setGallery] = useState<PostMediaItem[]>([]);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const photos = active === null ? items.filter(item => item.kind === "photo") : gallery;
  const opened = active === null ? null : photos[active];
  const move = (delta: number) => setActive(index => index === null ? null : (index + delta + photos.length) % photos.length);
  if (!items.length && active === null) return null;
  return <>
    <div className={cn("grid max-h-60 gap-1 overflow-hidden rounded-lg bg-muted/30 sm:max-h-80", items.length > 1 ? "h-60 grid-cols-2 sm:h-80" : "grid-cols-1", items.length > 2 && "grid-rows-2")}>
      {items.slice(0, 4).map((item, index) => item.kind === "video" ?
        <a key={`${item.src}-${index}`} href={url} target="_blank" rel="noopener noreferrer" className="relative flex min-h-11 min-w-0 items-center justify-center overflow-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`${title} 원문에서 영상 보기`}>
          <PostImage item={item} className={cn("max-h-60 max-w-full object-contain sm:max-h-80", items.length > 1 && "h-full w-full min-h-0")} />
          <span className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-center text-xs text-white">원문에서 영상 보기 ↗</span>
        </a> :
        <button key={`${item.src}-${index}`} type="button" className="relative flex min-h-11 min-w-0 items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`${title} 이미지 ${index + 1} 확대`} onClick={event => { trigger.current = event.currentTarget; setGallery(photos); setActive(photos.indexOf(item)); }}>
          <PostImage item={item} className={cn("max-h-60 max-w-full object-contain sm:max-h-80", items.length > 1 && "h-full w-full min-h-0")} />
          {index === 3 && items.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xl text-white">+{items.length - 4}</span>}
        </button>)}
    </div>
    {items.length > 4 && <div className="flex flex-wrap gap-2">
      {photos.length > 0 && <Button variant="ghost" className="min-h-11" onClick={event => { trigger.current = event.currentTarget; setGallery(photos); setActive(0); }}>사진 전체 {photos.length}장 보기</Button>}
      {items.slice(4).some(item => item.kind === "video") && <Button asChild variant="ghost" className="min-h-11"><a href={url} target="_blank" rel="noopener noreferrer">추가 영상은 원문에서 보기 ↗</a></Button>}
    </div>}
    <Dialog open={active !== null} onOpenChange={open => { if (!open) setActive(null); }}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-2 p-3 sm:max-w-4xl" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} onKeyDown={event => { if (photos.length < 2) return; if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); } }}>
        <div className="flex min-w-0 items-center justify-between gap-3"><DialogTitle className="truncate text-sm">{title}</DialogTitle><Button variant="ghost" className="size-11 shrink-0 p-0" aria-label="이미지 닫기" onClick={() => setActive(null)}><X className="size-5" /></Button></div>
        <DialogDescription className="sr-only">사진 전체 보기. 방향키로 사진을 바꾸고 Escape로 닫을 수 있습니다.</DialogDescription>
        {opened && <div className="flex min-h-0 items-center justify-center"><PostImage key={opened.src} item={opened} className="max-h-[calc(100dvh-13rem)] max-w-full object-contain" /></div>}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" className="size-11 p-0" disabled={photos.length < 2} aria-label="이전 이미지" onClick={() => move(-1)}><ChevronLeft /></Button>
          <span aria-live="polite" className="text-sm">{active === null ? 0 : active + 1} / {photos.length}</span>
          <Button asChild variant="ghost" className="min-h-11 px-2 text-xs"><a href={url} target="_blank" rel="noopener noreferrer">원문 보기 <ExternalLink className="size-3.5" /></a></Button>
          <Button variant="ghost" className="size-11 p-0" disabled={photos.length < 2} aria-label="다음 이미지" onClick={() => move(1)}><ChevronRight /></Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
