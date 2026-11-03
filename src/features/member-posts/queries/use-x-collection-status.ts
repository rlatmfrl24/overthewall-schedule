import { useQuery } from "@tanstack/react-query";
import { fetchXCollectionStatus, xCollectionQueryKey } from "../api/x-collection-api";

export const useXCollectionStatus = (enabled = true) => useQuery({ queryKey: xCollectionQueryKey, queryFn: fetchXCollectionStatus, enabled, staleTime: 30_000 });
