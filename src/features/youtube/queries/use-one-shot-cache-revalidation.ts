import { useEffect, useRef } from "react";
import type { YouTubePublicCacheMetadataDto } from "@contracts/youtube";

interface OneShotCacheRevalidationOptions {
  identity: string;
  cache: YouTubePublicCacheMetadataDto | null | undefined;
  refetch: () => Promise<unknown>;
}

/**
 * Demand-SWR 응답이 백그라운드 갱신을 예약한 경우 한 번만 결과를 확인한다.
 * 자동 재조회가 끝난 뒤 pending 대상이 남아도 연속 폴링하지 않는다.
 */
export function useOneShotCacheRevalidation({
  identity,
  cache,
  refetch,
}: OneShotCacheRevalidationOptions) {
  const stateRef = useRef({
    identity,
    completed: false,
    scheduledFor: null as string | null,
  });

  if (stateRef.current.identity !== identity) {
    stateRef.current = {
      identity,
      completed: false,
      scheduledFor: null,
    };
  }

  useEffect(() => {
    const state = stateRef.current;
    const delay = cache?.revalidateAfterMs ?? null;
    if (
      state.identity !== identity ||
      state.completed ||
      delay === null ||
      (cache?.pendingCount ?? 0) === 0
    ) {
      return;
    }

    const fetchedAtKey = cache?.oldestFetchedAt ?? "missing";
    if (state.scheduledFor === fetchedAtKey) return;
    state.scheduledFor = fetchedAtKey;

    const timer = window.setTimeout(() => {
      if (stateRef.current.identity !== identity) return;
      stateRef.current.completed = true;
      void refetch();
    }, delay);

    return () => {
      window.clearTimeout(timer);
      if (!state.completed && state.scheduledFor === fetchedAtKey) {
        state.scheduledFor = null;
      }
    };
  }, [
    cache?.oldestFetchedAt,
    cache?.pendingCount,
    cache?.revalidateAfterMs,
    identity,
    refetch,
  ]);
}
