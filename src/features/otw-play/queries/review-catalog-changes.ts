import type { QueryClient } from "@tanstack/react-query";
import type { OtwPlayAdminCatalogDto, OtwPlayIngestionReviewCandidateDto } from "@contracts/otw-play";
import { queryKeys } from "@/shared/query/query-keys";

export function applyReviewCatalogChanges(client: QueryClient, candidate: OtwPlayIngestionReviewCandidateDto) {
  const changes = candidate.catalogChanges;
  if (!changes) return;
  let missingRevisions = false;
  client.setQueryData<OtwPlayAdminCatalogDto>(queryKeys.otwPlay.adminCatalog(), previous => {
    if (!previous || previous.revision > changes.revision) return previous;
    const merge = <T extends { id: string }>(current: T[], incoming: T[]) =>
      [...new Map([...current, ...incoming].map(item => [item.id, item])).values()];
    // A delta from another revision must not certify that our entire snapshot is current.
    const contiguous = previous.revision === changes.revision - 1 || previous.revision === changes.revision;
    missingRevisions = !contiguous;
    return { ...previous, songs: merge(previous.songs, changes.songs), entities: merge(previous.entities, changes.entities),
      ...(contiguous ? { revision: changes.revision, readModelRevision: changes.revision } : {}) };
  });
  if (missingRevisions) {
    void client.invalidateQueries({ queryKey: queryKeys.otwPlay.adminCatalog(), exact: true });
  }
}
