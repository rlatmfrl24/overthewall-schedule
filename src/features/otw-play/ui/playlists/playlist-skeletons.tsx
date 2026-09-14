import { Skeleton } from "@/shared/ui/skeleton";

export function PlaylistCardsSkeleton({ discovery = false, personal = false }: { discovery?: boolean; personal?: boolean }) {
  return <div role="status" aria-label="플레이리스트 불러오는 중">
    <div aria-hidden="true" className={discovery ? "playlist-discovery-grid" : "playlist-grid"}>
      {Array.from({ length: personal ? 4 : 6 }, (_, index) => <div key={index} className={`playlist-card ${!discovery && !personal && index < 2 ? "playlist-card-featured" : ""} bg-card p-6 ${personal ? "min-h-[280px]" : "min-h-[320px]"}`}>
        <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
        <div className="mt-auto space-y-3 pt-20"><Skeleton className="h-8 w-3/4 motion-reduce:animate-none" /><Skeleton className="h-4 w-full motion-reduce:animate-none" /><Skeleton className="h-4 w-2/3 motion-reduce:animate-none" /></div>
        <div className="mt-6 border-t border-border pt-3"><Skeleton className="h-3 w-12 motion-reduce:animate-none" /></div>
      </div>)}
    </div>
  </div>;
}

export function PlaylistTracksSkeleton({ compact = false }: { compact?: boolean }) {
  return <div role="status" aria-label="곡 목록 불러오는 중">
    <div aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div key={index} className={`playlist-track${compact ? " playlist-track-compact" : ""}`}>
      <Skeleton className={`${compact ? "h-8 w-14" : "h-[45px] w-20"} shrink-0 motion-reduce:animate-none`} />
      <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-2/3 max-w-64 motion-reduce:animate-none" /><Skeleton className="h-3 w-1/2 max-w-40 motion-reduce:animate-none" />{!compact && <Skeleton className="h-3 w-24 motion-reduce:animate-none" />}</div>
      <Skeleton className="h-8 w-12 shrink-0 motion-reduce:animate-none" />
    </div>)}</div>
  </div>;
}

export function PlaylistDetailSkeleton() {
  return <div className="space-y-4">
    <div role="status" aria-label="플레이리스트 정보 불러오는 중">
      <div aria-hidden="true" className="playlist-heading playlist-detail-heading">
        <Skeleton className="h-16 w-24 shrink-0 motion-reduce:animate-none" />
        <div className="playlist-detail-copy min-w-0 space-y-3"><Skeleton className="h-3 w-24 motion-reduce:animate-none" /><Skeleton className="h-8 w-3/4 max-w-80 motion-reduce:animate-none" /><Skeleton className="h-4 w-1/2 motion-reduce:animate-none" /></div>
        <div className="playlist-detail-actions flex flex-wrap gap-2"><Skeleton className="h-9 w-32 motion-reduce:animate-none" /><Skeleton className="h-9 w-24 motion-reduce:animate-none" /></div>
      </div>
    </div>
    <PlaylistTracksSkeleton />
  </div>;
}
