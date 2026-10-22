import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { site } from "@/shared/config/site";
import { addPersonalMultiviewChannel, deletePersonalMultiviewChannel, fetchPersonalMultiviewChannels, fetchPersonalMultiviewLiveStatus } from "../api/personal-channels";

type Operation = { owner?: string; adding: boolean; deleting: string[]; addError: Error | null; deleteError: Error | null };
const emptyOperation = (owner?: string): Operation => ({ owner, adding: false, deleting: [], addError: null, deleteError: null });
const toError = (value: unknown) => value instanceof Error ? value : new Error("요청을 처리하지 못했어요. 다시 시도해 주세요.");

export function usePersonalMultiview() {
  const { isLoaded, isSignedIn, user } = useUser();
  const owner = isLoaded && isSignedIn ? user?.id : undefined;
  const client = useQueryClient();
  const prefix = ["multiview-private", site.id, owner] as const;
  const listKey = [...prefix, "channels"] as const;
  const list = currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS, queryKey: listKey, queryFn: ({ signal }) => fetchPersonalMultiviewChannels(signal), enabled: Boolean(owner), retry: false }));
  const channels = list.data?.items ?? [];
  const statuses = currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: [...prefix, "live-status", channels.map(channel => channel.channelId).join(",")],
    queryFn: ({ signal }) => fetchPersonalMultiviewLiveStatus(signal), enabled: Boolean(owner && list.data && channels.length), retry: false,
    refetchInterval: 90_000, refetchIntervalInBackground: false,
  }));
  const running = useRef(new Map<string, AbortController>());
  const [operation, setOperation] = useState<Operation>(() => emptyOperation(owner));
  const visible = operation.owner === owner ? operation : emptyOperation(owner);
  useEffect(() => {
    const jobs = running.current;
    return () => {
      for (const job of jobs.values()) job.abort();
      jobs.clear();
      if (owner) {
        void client.cancelQueries({ queryKey: ["multiview-private", site.id, owner] });
        client.removeQueries({ queryKey: ["multiview-private", site.id, owner] });
      }
    };
  }, [client, owner]);
  const update = (patch: Partial<Operation>) => setOperation(current => ({ ...(current.owner === owner ? current : emptyOperation(owner)), ...patch, owner }));
  const mutate = async (kind: "add" | "delete", value: string) => {
    if (!owner) throw new Error("로그인이 필요합니다.");
    const key = kind === "add" ? "add" : `delete:${value}`;
    if (running.current.has(key)) return;
    const controller = new AbortController();
    running.current.set(key, controller);
    const name = channels.find(channel => channel.channelId === value)?.channelName ?? value;
    update(kind === "add" ? { adding: true, addError: null } : { deleting: [...visible.deleting, value], deleteError: null });
    try {
      if (kind === "add") await addPersonalMultiviewChannel(value, controller.signal);
      else await deletePersonalMultiviewChannel(value, controller.signal);
      if (controller.signal.aborted) return;
      await client.invalidateQueries({ queryKey: prefix });
      if (controller.signal.aborted) return;
      if (client.getQueryState(listKey)?.status === "error") update(kind === "add"
        ? { addError: new Error("저장됐지만 목록을 다시 불러오지 못했어요. 다시 불러와 주세요.") }
        : { deleteError: new Error("삭제했지만 목록을 다시 불러오지 못했어요. 다시 불러와 주세요.") });
    } catch (error) {
      if (controller.signal.aborted) return;
      update(kind === "add" ? { addError: toError(error) } : { deleteError: new Error(`${name} 삭제 실패: ${toError(error).message}`) });
      throw error;
    } finally {
      if (running.current.get(key) === controller) running.current.delete(key);
      if (!controller.signal.aborted) setOperation(current => current.owner !== owner ? current : { ...current, ...(kind === "add" ? { adding: false } : { deleting: current.deleting.filter(id => id !== value) }) });
    }
  };
  return {
    owner, isLoaded, isSignedIn: Boolean(owner), channels, statuses: statuses.data?.items ?? [],
    loading: Boolean(owner && list.isPending), statusLoading: statuses.isFetching,
    listError: list.error, statusError: statuses.error, addError: visible.addError, deleteError: visible.deleteError,
    addPending: visible.adding, deletingIds: visible.deleting,
    add: (input: string) => mutate("add", input), remove: (channelId: string) => mutate("delete", channelId),
    reload: async () => { update({ addError: null, deleteError: null }); await client.refetchQueries({ queryKey: prefix, type: "active" }); },
  };
}
