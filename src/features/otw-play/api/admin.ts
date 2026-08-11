import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminCatalogEntryPreflightDto,
  OtwPlayAdminCatalogEntryPreflightRequest,
  OtwPlayAdminCatalogEntryResultDto,
  OtwPlayAdminChannelDto,
  OtwPlayAdminCommandResponse,
  OtwPlayAdminCreateChannelRequest,
  OtwPlayAdminCreateCatalogEntryRequest,
  OtwPlayAdminCreateEntityRequest,
  OtwPlayAdminCreatePerformanceRequest,
  OtwPlayAdminCreateSongRequest,
  OtwPlayAdminEntityDto,
  OtwPlayAdminExpectedVersionRequest,
  OtwPlayAdminPerformanceDto,
  OtwPlayAdminProposalDto,
  OtwPlayAdminRecheckSourceRequest,
  OtwPlayAdminRejectProposalRequest,
  OtwPlayAdminSongDto,
  OtwPlayAdminSourceDto,
  OtwPlayAdminUpdateChannelRequest,
  OtwPlayAdminUpdateEntityRequest,
  OtwPlayAdminUpdatePerformanceRequest,
  OtwPlayAdminUpdateSongRequest,
} from "@contracts/otw-play";
import { apiFetch } from "@/shared/api/client";

const adminRequest = <T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
) => apiFetch<T>(path, { ...init, auth: "required" });

export const fetchOtwPlayAdminCatalog = () =>
  adminRequest<{ data: OtwPlayAdminCatalogDto }>(
    apiRoutes.otwPlay.admin.catalog.build(),
  ).then((response) => response.data);

export const preflightOtwPlayCatalogEntry = (
  json: OtwPlayAdminCatalogEntryPreflightRequest,
) =>
  adminRequest<{ data: OtwPlayAdminCatalogEntryPreflightDto }>(
    apiRoutes.otwPlay.admin.catalogEntryPreflight.build(),
    { method: "POST", json },
  ).then((response) => response.data);

export const createOtwPlayCatalogEntry = (
  json: OtwPlayAdminCreateCatalogEntryRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminCatalogEntryResultDto>>(
    apiRoutes.otwPlay.admin.catalogEntries.build(),
    { method: "POST", json },
  );

export const fetchOtwPlayAdminProposals = (status?: string) => {
  const search = new URLSearchParams();
  if (status) search.set("status", status);
  return adminRequest<{ data: OtwPlayAdminProposalDto[] }>(
    withRouteSearch(apiRoutes.otwPlay.admin.submissions.build(), search),
  ).then((response) => response.data);
};

export const createOtwPlayEntity = (json: OtwPlayAdminCreateEntityRequest) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminEntityDto>>(
    apiRoutes.otwPlay.admin.entities.build(),
    { method: "POST", json },
  );
export const updateOtwPlayEntity = (json: OtwPlayAdminUpdateEntityRequest) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminEntityDto>>(
    apiRoutes.otwPlay.admin.entities.build(),
    { method: "PUT", json },
  );
export const createOtwPlaySong = (json: OtwPlayAdminCreateSongRequest) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminSongDto>>(
    apiRoutes.otwPlay.admin.songs.build(),
    { method: "POST", json },
  );
export const updateOtwPlaySong = (json: OtwPlayAdminUpdateSongRequest) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminSongDto>>(
    apiRoutes.otwPlay.admin.songs.build(),
    { method: "PUT", json },
  );
export const createOtwPlayPerformance = (
  json: OtwPlayAdminCreatePerformanceRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminPerformanceDto>>(
    apiRoutes.otwPlay.admin.performances.build(),
    { method: "POST", json },
  );
export const updateOtwPlayPerformance = (
  json: OtwPlayAdminUpdatePerformanceRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminPerformanceDto>>(
    apiRoutes.otwPlay.admin.performances.build(),
    { method: "PUT", json },
  );
export const publishOtwPlayPerformance = (
  id: string,
  json: OtwPlayAdminExpectedVersionRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminPerformanceDto>>(
    apiRoutes.otwPlay.admin.publishPerformance.build(id),
    { method: "POST", json },
  );
export const withdrawOtwPlayPerformance = (
  id: string,
  json: OtwPlayAdminExpectedVersionRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminPerformanceDto>>(
    apiRoutes.otwPlay.admin.withdrawPerformance.build(id),
    { method: "POST", json },
  );
export const createOtwPlayChannel = (json: OtwPlayAdminCreateChannelRequest) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>(
    apiRoutes.otwPlay.admin.channels.build(),
    { method: "POST", json },
  );
export const updateOtwPlayChannel = (json: OtwPlayAdminUpdateChannelRequest) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>(
    apiRoutes.otwPlay.admin.channels.build(),
    { method: "PUT", json },
  );
export const deleteOtwPlayChannel = (
  id: string,
  json: OtwPlayAdminExpectedVersionRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<{ id: string }>>(
    withRouteSearch(
      apiRoutes.otwPlay.admin.channels.build(),
      new URLSearchParams({ id }),
    ),
    { method: "DELETE", json },
  );
export const recheckOtwPlaySource = (
  id: string,
  json: OtwPlayAdminRecheckSourceRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminSourceDto>>(
    apiRoutes.otwPlay.admin.recheckSource.build(id),
    { method: "POST", json },
  );
export const rejectOtwPlayProposal = (
  id: string,
  json: OtwPlayAdminRejectProposalRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminProposalDto>>(
    apiRoutes.otwPlay.admin.rejectSubmission.build(id),
    { method: "POST", json },
  );
