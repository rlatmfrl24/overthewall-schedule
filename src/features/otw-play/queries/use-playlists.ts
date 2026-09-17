import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import type { PlayPerformanceQuery } from "@contracts/otw-play-playlists";
import { fetchDefaultPlaylists, fetchMyPlaylist, fetchMyPlaylists, fetchPlaylistPerformances } from "../api/playlists";
import { usePublicRequestOptions } from "./use-public-catalog";
import { collectPlaylist } from "../use-cases/resolve-playlist";
import { useOtwPlayPlayer } from "../player/play-player-context";

export function usePlaylistDefaults() {
  const request = usePublicRequestOptions();
  return useQuery({ queryKey: ["otw-play", "playlist-defaults", request.audience],
    queryFn: ({ signal }) => fetchDefaultPlaylists({ ...request, signal }) });
}
export function usePlaylistPerformances(query: PlayPerformanceQuery, enabled = true) {
  const request = usePublicRequestOptions();
  return useInfiniteQuery({ queryKey: ["otw-play", "playlist-performances", request.audience, query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchPlaylistPerformances({ ...query, cursor: pageParam }, { ...request, signal }),
    getNextPageParam: page => page.nextCursor ?? undefined, enabled });
}
export function usePlaylistOwner() {
  const { user } = useUser();
  const client = useQueryClient();
  const owner = user?.id;
  useEffect(() => () => {
    if (owner) {
      void client.cancelQueries({ queryKey: ["otw-play-private", owner] });
      client.removeQueries({ queryKey: ["otw-play-private", owner] });
    }
  }, [client, owner]);
  return owner;
}
export function useMyPlaylists() {
  const owner = usePlaylistOwner(), request = usePublicRequestOptions();
  return useQuery({ queryKey: ["otw-play-private", owner, request.audience, "playlists"],
    queryFn: ({ signal }) => fetchMyPlaylists({ ...request, signal }), enabled: Boolean(owner), staleTime: 0 });
}
export function useMyPlaylist(id: string | undefined) {
  const owner = usePlaylistOwner(), request = usePublicRequestOptions();
  return useQuery({ queryKey: ["otw-play-private", owner, request.audience, "playlist", id],
    queryFn: ({ signal }) => fetchMyPlaylist(id!, { ...request, signal }), enabled: Boolean(owner && id), staleTime: 0 });
}
export function useResolvedPlaylist(ids: string[] | undefined) {
  const owner = usePlaylistOwner(), request = usePublicRequestOptions();
  return useQuery({ queryKey: ["otw-play-private", owner, request.audience, "resolved", ids],
    queryFn: ({ signal }) => collectPlaylist(ids!, { ...request, signal }), enabled: Boolean(owner && ids) });
}

export function usePlaylistActions() {
  const request = usePublicRequestOptions();
  const player = useOtwPlayPlayer();
  const append = useRef(player.enqueueBatch);
  useEffect(() => { append.current = player.enqueueBatch; }, [player.enqueueBatch]);
  const tail = useRef(Promise.resolve());
  const running = useRef(new Map<string, AbortController>());
  const [pending, setPending] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<{ completed: number; total?: number } | null>(null);
  useEffect(() => {
    const jobs = running.current;
    return () => { for (const job of jobs.values()) job.abort(); jobs.clear(); };
  }, []);
  const add = (id: string, query: PlayPerformanceQuery | string[], playFirst = false, total?: number) => {
    if (running.current.has(id)) return;
    const controller = new AbortController();
    running.current.set(id, controller); setPending([...running.current.keys()]);
    setMessage("");
    const execute = async () => {
      try {
        controller.signal.throwIfAborted();
        const expected = Array.isArray(query) ? query.length : total;
        setProgress({ completed: 0, total: expected });
        const result = await collectPlaylist(query, { ...request, signal: controller.signal }, count => { if (!controller.signal.aborted) setProgress({ completed: count, total: expected }); });
        controller.signal.throwIfAborted();
        const tracks = result.items.flatMap(item => item.performance.playable && item.performance.selectedSource
          ? [{ ...item, source: item.performance.selectedSource }] : []);
        setMessage(append.current(tracks, result.unavailableIds.length + result.items.length - tracks.length, playFirst));
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? `목록에 담지 못했어요. ${error.message}` : "목록에 담지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (running.current.get(id) === controller) {
          running.current.delete(id); setPending([...running.current.keys()]);
          setProgress(null);
        }
      }
    };
    tail.current = tail.current.then(execute, execute);
  };
  const cancel = () => { for (const controller of running.current.values()) controller.abort(); running.current.clear(); setPending([]); setProgress(null); setMessage("추가를 취소했어요. 원할 때 다시 담아 주세요."); };
  return { add, cancel, pending, message, progress };
}
