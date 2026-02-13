import { useCallback, useEffect, useState } from "react";
import { fetchActiveMembers } from "@/lib/api/members";
import { fetchDDays } from "@/lib/api/ddays";
import type { DDayItem, Member } from "@/lib/types";

const SCHEDULE_DATA_CACHE_TTL_MS = 5 * 60_000;

let cachedMembers: Member[] | null = null;
let cachedDDays: DDayItem[] | null = null;
let membersFetchedAt = 0;
let ddaysFetchedAt = 0;
let membersInFlight: Promise<Member[]> | null = null;
let ddaysInFlight: Promise<DDayItem[]> | null = null;
let allInFlight: Promise<{ members: Member[]; ddays: DDayItem[] }> | null =
  null;

const isFresh = (fetchedAt: number) =>
  Date.now() - fetchedAt < SCHEDULE_DATA_CACHE_TTL_MS;

const hasFreshMembers = () => cachedMembers !== null && isFresh(membersFetchedAt);
const hasFreshDDays = () => cachedDDays !== null && isFresh(ddaysFetchedAt);

const fetchAndCacheMembers = async () => {
  if (membersInFlight) return membersInFlight;

  const request = (async () => {
    const data = await fetchActiveMembers();
    cachedMembers = data;
    membersFetchedAt = Date.now();
    return data;
  })();

  membersInFlight = request;
  try {
    return await request;
  } finally {
    membersInFlight = null;
  }
};

const fetchAndCacheDDays = async () => {
  if (ddaysInFlight) return ddaysInFlight;

  const request = (async () => {
    const data = await fetchDDays();
    cachedDDays = data;
    ddaysFetchedAt = Date.now();
    return data;
  })();

  ddaysInFlight = request;
  try {
    return await request;
  } finally {
    ddaysInFlight = null;
  }
};

const fetchAndCacheAll = async () => {
  if (allInFlight) return allInFlight;

  const request = (async () => {
    const [members, ddays] = await Promise.all([
      fetchAndCacheMembers(),
      fetchAndCacheDDays(),
    ]);
    return { members, ddays };
  })();

  allInFlight = request;
  try {
    return await request;
  } finally {
    allInFlight = null;
  }
};

export function useScheduleData() {
  const [members, setMembers] = useState<Member[]>(() => cachedMembers ?? []);
  const [ddays, setDDays] = useState<DDayItem[]>(() => cachedDDays ?? []);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(
    () => cachedMembers !== null && cachedDDays !== null,
  );

  const reloadMembers = useCallback(async () => {
    const data = await fetchAndCacheMembers();
    setMembers(data);
  }, []);

  const reloadDDays = useCallback(async () => {
    const data = await fetchAndCacheDDays();
    setDDays(data);
  }, []);

  const reloadAll = useCallback(async () => {
    if (hasFreshMembers() && hasFreshDDays()) {
      setMembers(cachedMembers ?? []);
      setDDays(cachedDDays ?? []);
      setHasLoaded(true);
      return;
    }

    setLoading(true);
    try {
      const { members: memberData, ddays: ddayData } = await fetchAndCacheAll();
      setMembers(memberData ?? []);
      setDDays(ddayData ?? []);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  return {
    members,
    ddays,
    loading,
    hasLoaded,
    reloadMembers,
    reloadDDays,
    reloadAll,
  };
}
