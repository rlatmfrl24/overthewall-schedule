import { useCallback, useEffect, useState } from "react";
import { fetchActiveMembers } from "@/lib/api/members";
import { fetchDDays } from "@/lib/api/ddays";
import type { DDayItem, Member } from "@/lib/types";

export function useScheduleData() {
  const [members, setMembers] = useState<Member[]>([]);
  const [ddays, setDDays] = useState<DDayItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reloadMembers = useCallback(async () => {
    const data = await fetchActiveMembers();
    setMembers(data);
  }, []);

  const reloadDDays = useCallback(async () => {
    const data = await fetchDDays();
    setDDays(data);
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [memberData, ddayData] = await Promise.all([
        fetchActiveMembers(),
        fetchDDays(),
      ]);
      setMembers(memberData);
      setDDays(ddayData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  return {
    members,
    ddays,
    loading,
    reloadMembers,
    reloadDDays,
    reloadAll,
  };
}


