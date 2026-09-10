import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import type { PlayAdminDefaultPlaylist, PlayDefaultPlaylistWrite } from "@contracts/otw-play-playlists";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { ApiError } from "@/shared/api/client";
import { fetchAdminDefaultPlaylists, fetchAdminDefaultPlaylist, saveAdminDefaultPlaylist, resolvePlaylistPerformances } from "../../api/playlists";
import { OtwPlayCatalogRequestProvider } from "../../queries/use-public-catalog";
import { usePlaylistPerformances } from "../../queries/use-playlists";
import { DefaultPlaylistCard } from "./playlist-components";
import { performanceArtwork } from "../../model/playlist-artwork";
import { PlaylistArtworkPreview } from "./playlist-artwork-preview";

export function OtwPlayDefaultPlaylistManager() {
  const { user } = useUser(), client = useQueryClient();
  const owner = user?.id;
  useEffect(() => () => { void client.cancelQueries({ queryKey: ["otw-play-admin-playlists", owner] });
    client.removeQueries({ queryKey: ["otw-play-admin-playlists", owner] }); }, [client, owner]);
  return <OtwPlayCatalogRequestProvider adminPreview><Manager key={owner} owner={owner} /></OtwPlayCatalogRequestProvider>;
}

function Manager({ owner }: { owner?: string }) {
  const query = useQuery({ queryKey: ["otw-play-admin-playlists", owner, "list"], enabled: Boolean(owner),
    queryFn: ({ signal }) => fetchAdminDefaultPlaylists(signal) });
  const [selected, setSelected] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const discard = useUnsavedChanges(dirty);
  const playlist = query.data?.data.find(item => item.id === selected) ?? query.data?.data[0];
  if (query.isPending) return <p role="status">기본 플레이리스트 불러오는 중…</p>;
  if (query.isError) return <div role="alert">기본 플레이리스트를 불러오지 못했습니다. <Button onClick={() => void query.refetch()}>다시 시도</Button></div>;
  return <section className="space-y-3"><h2 className="text-xl font-semibold">기본 플레이리스트 관리</h2>
    <p className="text-sm text-muted-foreground">자동으로 구성되는 목록의 이름, 설명과 대표곡을 지정합니다.</p>
    <label className="flex items-center gap-2 text-sm">플레이리스트
      <select className="min-w-0 max-w-full rounded-md border bg-background p-2" value={playlist?.id ?? ""} onChange={event => {
        const id = event.target.value; void discard().then(ok => { if (ok) { setDirty(false); setSelected(id); } });
      }}>{query.data.data.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    {playlist && <DefaultEditor key={playlist.id} initial={playlist} owner={owner} onDirty={setDirty} discard={discard} />}
  </section>;
}

function DefaultEditor({ initial, owner, onDirty, discard }: { initial: PlayAdminDefaultPlaylist; owner?: string; onDirty: (value: boolean) => void; discard: () => Promise<boolean> }) {
  const [saved, setSaved] = useState(initial), [draft, setDraft] = useState<PlayDefaultPlaylistWrite>(initial.overrides);
  const [q, setQ] = useState(""), [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const client = useQueryClient();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.overrides);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const candidates = usePlaylistPerformances({ ...saved.query, q: search || undefined });
  const selected = useQuery({ queryKey: ["otw-play-admin-playlists", owner, "representative", draft.representativePerformanceId],
    enabled: Boolean(draft.representativePerformanceId),
    queryFn: ({ signal }) => resolvePlaylistPerformances([draft.representativePerformanceId!], { adminPreview: true, signal }) });
  const all = candidates.data?.pages.flatMap(page => page.data.items) ?? [];
  const representative = all.find(item => item.performance.id === draft.representativePerformanceId) ?? selected.data?.data.items[0];
  const image = draft.representativePerformanceId === saved.representativePerformanceId && !saved.representativeAvailable ? null : performanceArtwork(representative);
  const preview = { ...saved, title: draft.title ?? saved.defaults.title, description: draft.description ?? saved.defaults.description,
    representativePerformanceId: draft.representativePerformanceId, imageUrl: image ?? saved.defaults.imageUrl };
  const apply = (next: PlayAdminDefaultPlaylist) => { setSaved(next); setDraft(next.overrides); };
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await saveAdminDefaultPlaylist(saved.id, draft, saved.version);
      // Keep the acknowledged version even if the following readback fails.
      setSaved(current => ({ ...current, version: response.data.version }));
      const readback = await fetchAdminDefaultPlaylist(saved.id);
      apply(readback.data);
      await Promise.all([client.invalidateQueries({ queryKey: ["otw-play-admin-playlists", owner, "list"] }),
        client.invalidateQueries({ queryKey: ["otw-play", "playlist-defaults"] })]);
      setMessage("저장했습니다.");
    } catch (error) {
      setMessage(error instanceof ApiError && error.status === 409 ? "다른 곳에서 변경되었습니다. 입력은 유지됩니다. 서버 목록을 다시 불러와 확인해 주세요." : "저장하지 못했습니다. 입력은 유지됩니다.");
    } finally { setBusy(false); }
  };
  const reload = async () => {
    if (!await discard()) return;
    setBusy(true);
    try { apply((await fetchAdminDefaultPlaylist(saved.id)).data); setMessage("서버 목록을 불러왔습니다."); }
    catch { setMessage("서버 목록을 불러오지 못했습니다."); } finally { setBusy(false); }
  };
  return <div className="grid min-w-0 gap-4 lg:grid-cols-2">
    <div className="min-w-0 space-y-3">
      <label className="grid gap-1 text-sm">이름<Input value={draft.title ?? saved.defaults.title} maxLength={120} disabled={busy}
        onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
      <label className="grid gap-1 text-sm">설명<textarea className="min-h-16 rounded-md border bg-background p-2" maxLength={2000} disabled={busy}
        value={draft.description ?? saved.defaults.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></label>
      <PlaylistArtworkPreview item={representative} imageUrl={preview.imageUrl}
        unavailable={Boolean(draft.representativePerformanceId && !selected.isPending && !image)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setDraft(current => ({ ...current, representativePerformanceId: null }))}>자동 이미지 사용</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setDraft({ title: null, description: null, representativePerformanceId: null })}>기본 설정으로 복원</Button>
        <Button size="sm" disabled={busy || !preview.title.trim()} onClick={() => void save()}>{busy ? "저장 확인 중…" : "저장"}</Button>
      </div>
      <p role="status" className="text-sm">{message || (dirty ? "저장하지 않은 변경사항이 있습니다." : "")}</p>
      {message && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reload()}>서버 목록 다시 불러오기</Button>}
      <div className="max-w-lg" aria-label="기본 플레이리스트 카드 미리보기"><DefaultPlaylistCard playlist={preview} /></div>
    </div>
    <div className="min-w-0 space-y-2"><h3 className="font-semibold">대표곡 선택</h3>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); setSearch(q.trim()); }}>
        <Input aria-label="대표곡 검색" placeholder="곡명 · 가창자" value={q} maxLength={80} onChange={event => setQ(event.target.value)} />
        <Button type="submit" size="sm">검색</Button></form>
      <div className="max-h-[65vh] space-y-1 overflow-y-auto">
        {candidates.isPending ? <p role="status">검색 중…</p> : candidates.isError ? <Button onClick={() => void candidates.refetch()}>검색 다시 시도</Button> : all.map(item =>
          <div className="flex min-w-0 items-center gap-2 rounded border p-2" key={item.performance.id}>
            <img className="h-9 w-14 shrink-0 rounded object-cover" src={performanceArtwork(item) || "/images/otw-play/glass-note.png"} alt="" />
            <div className="min-w-0 flex-1 text-xs"><p className="truncate font-medium">{item.song.title}</p>
              <p className="truncate text-muted-foreground">{item.performance.participants.map(p => p.displayName).join(" · ")} · {item.performance.releasedAt?.slice(0, 10)}</p></div>
            <Button size="sm" variant={draft.representativePerformanceId === item.performance.id ? "default" : "outline"}
              aria-label={`${item.song.title} 대표곡 지정`} aria-pressed={draft.representativePerformanceId === item.performance.id}
              disabled={busy || !performanceArtwork(item)} onClick={() => setDraft(current => ({ ...current, representativePerformanceId: item.performance.id }))}>
              {draft.representativePerformanceId === item.performance.id ? "대표곡" : "지정"}</Button>
          </div>)}
        {candidates.isSuccess && !all.length && <p className="text-sm text-muted-foreground">선택할 수 있는 가창이 없습니다.</p>}
        {candidates.hasNextPage && <Button disabled={candidates.isFetching} onClick={() => void candidates.fetchNextPage()}>더 보기</Button>}
      </div>
    </div>
  </div>;
}
