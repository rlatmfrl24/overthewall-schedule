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
  OtwPlayAdminObservabilityDto,
  OtwPlayAdminProposalDto,
  OtwPlayAdminRecheckSourceRequest,
  OtwPlayAdminReleaseCommandResponse,
  OtwPlayAdminReleaseReadResponse,
  OtwPlayAdminReleaseRequest,
  OtwPlayAdminRejectProposalRequest,
  OtwPlayAdminSongDto,
  OtwPlayAdminSourceHealthDto,
  OtwPlayAdminSourceRecheckResponse,
  OtwPlayAdminUpdateChannelRequest,
  OtwPlayAdminUpdateEntityRequest,
  OtwPlayAdminUpdatePerformanceRequest,
  OtwPlayAdminUpdateSongRequest,
  OtwPlayAdminApproveProposalRequest,
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayConvertIngestionCandidatesRequest,
  OtwPlayConvertIngestionCandidatesResponse,
  OtwPlayIngestionCandidatePageDto,
  OtwPlayIgnoreIngestionCandidatesRequest,
  OtwPlayIgnoreIngestionCandidatesResponse,
  OtwPlayIngestionReviewCandidateDto,
  OtwPlayIngestionJobDto,
  OtwPlayIngestionItemFilters,
  OtwPlayPlaylistPreflightDto,
  OtwPlayPlaylistPreflightRequest,
  OtwPlayRetryIngestionJobResponse,
  OtwPlayUpdateIngestionCandidateRequest,
  OtwPlayChannelMonitorCandidateDto,
  OtwPlayChannelMonitorDto,
  OtwPlayChannelMonitorReconcileDto,
  OtwPlayCreateChannelMonitorRequest,
  OtwPlayDeleteChannelMonitorDto,
  OtwPlayDeleteChannelMonitorRequest,
  OtwPlayUpdateChannelMonitorRequest,
} from "@contracts/otw-play";
import { apiFetch } from "@/shared/api/client";

const adminRequest = <T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
) => apiFetch<T>(path, { ...init, auth: "required" });

export const preflightOtwPlayPlaylistImport = (
  json: OtwPlayPlaylistPreflightRequest,
) => adminRequest<{ data: OtwPlayPlaylistPreflightDto }>(
  apiRoutes.otwPlay.admin.playlistImportPreflight.build(),
  { method: "POST", json },
).then((response) => response.data);

export const createOtwPlayPlaylistImport = (
  json: OtwPlayCreatePlaylistImportRequest,
) => adminRequest<{ data: OtwPlayIngestionJobDto }>(
  apiRoutes.otwPlay.admin.playlistImports.build(),
  { method: "POST", json },
).then((response) => response.data);

export const fetchOtwPlayImportJob = (jobId: string) =>
  adminRequest<{ data: OtwPlayIngestionJobDto }>(
    apiRoutes.otwPlay.admin.importJob.build(jobId),
  ).then((response) => response.data);

export const fetchOtwPlayImportJobs = () =>
  adminRequest<{ data: OtwPlayIngestionJobDto[] }>(
    withRouteSearch(
      apiRoutes.otwPlay.admin.importJobs.build(),
      new URLSearchParams({ limit: "100" }),
    ),
  ).then((response) => response.data);

export const fetchOtwPlayChannelMonitors = () =>
  adminRequest<{ data: OtwPlayChannelMonitorDto[] }>(
    apiRoutes.otwPlay.admin.channelMonitors.build(),
  ).then((response) => response.data);

export const createOtwPlayChannelMonitor = (
  json: OtwPlayCreateChannelMonitorRequest,
) => adminRequest<{ data: OtwPlayChannelMonitorDto }>(
  apiRoutes.otwPlay.admin.channelMonitors.build(),
  { method: "POST", json },
).then((response) => response.data);

export const updateOtwPlayChannelMonitor = (
  id: string,
  json: OtwPlayUpdateChannelMonitorRequest,
) => adminRequest<{ data: OtwPlayChannelMonitorDto }>(
  apiRoutes.otwPlay.admin.channelMonitor.build(id),
  { method: "PATCH", json },
).then((response) => response.data);

export const deleteOtwPlayChannelMonitor = (
  id: string,
  json: OtwPlayDeleteChannelMonitorRequest,
) => adminRequest<{ data: OtwPlayDeleteChannelMonitorDto }>(
  apiRoutes.otwPlay.admin.channelMonitor.build(id),
  { method: "DELETE", json },
).then((response) => response.data);

export const reconcileOtwPlayChannelMonitor = (id: string) =>
  adminRequest<{ data: OtwPlayChannelMonitorReconcileDto }>(
    apiRoutes.otwPlay.admin.reconcileChannelMonitor.build(id),
    { method: "POST", json: {} },
  ).then((response) => response.data);

export const fetchOtwPlayChannelMonitorCandidates = (id: string) =>
  adminRequest<{ data: OtwPlayChannelMonitorCandidateDto[] }>(
    withRouteSearch(
      apiRoutes.otwPlay.admin.channelMonitorCandidates.build(id),
      new URLSearchParams({ limit: "100" }),
    ),
  ).then((response) => response.data);

export const fetchOtwPlayImportJobItems = (
  jobId: string,
  options: {
    limit?: number;
    cursor?: string | null;
  } & OtwPlayIngestionItemFilters = {},
) => {
  const search = new URLSearchParams();
  if (options.limit !== undefined) search.set("limit", String(options.limit));
  if (options.cursor) search.set("cursor", options.cursor);
  if (options.classification) {
    search.set("classification", options.classification);
  }
  if (options.status) search.set("status", options.status);
  return adminRequest<{ data: OtwPlayIngestionCandidatePageDto }>(
    withRouteSearch(
      apiRoutes.otwPlay.admin.importJobItems.build(jobId),
      search,
    ),
  ).then((response) => response.data);
};

export const updateOtwPlayImportCandidate = (
  candidateId: string,
  json: OtwPlayUpdateIngestionCandidateRequest,
) => adminRequest<{ data: OtwPlayIngestionReviewCandidateDto }>(
  apiRoutes.otwPlay.admin.importCandidate.build(candidateId),
  { method: "PATCH", json },
).then((response) => response.data);

export const convertOtwPlayImportCandidates = (
  jobId: string,
  json: OtwPlayConvertIngestionCandidatesRequest,
) => adminRequest<{ data: OtwPlayConvertIngestionCandidatesResponse }>(
  apiRoutes.otwPlay.admin.convertImportJob.build(jobId),
  { method: "POST", json },
).then((response) => response.data);

export const ignoreOtwPlayImportCandidates = (
  jobId: string,
  json: OtwPlayIgnoreIngestionCandidatesRequest,
) => adminRequest<{ data: OtwPlayIgnoreIngestionCandidatesResponse }>(
  apiRoutes.otwPlay.admin.ignoreImportJobCandidates.build(jobId),
  { method: "POST", json },
).then((response) => response.data);

export const retryOtwPlayImportJob = (jobId: string) =>
  adminRequest<{ data: OtwPlayRetryIngestionJobResponse }>(
    apiRoutes.otwPlay.admin.retryImportJob.build(jobId),
    { method: "POST", json: {} },
  ).then((response) => response.data);

export const fetchOtwPlayAdminCatalog = () =>
  adminRequest<{ data: OtwPlayAdminCatalogDto }>(
    apiRoutes.otwPlay.admin.catalog.build(),
  ).then((response) => response.data);

export const fetchOtwPlayAdminSourceHealth = () =>
  adminRequest<{ data: OtwPlayAdminSourceHealthDto }>(
    apiRoutes.otwPlay.admin.sourceHealth.build(),
  ).then((response) => response.data);

export const fetchOtwPlayAdminObservability = () =>
  adminRequest<OtwPlayAdminObservabilityDto>(
    apiRoutes.otwPlay.admin.observability.build(),
  );

export const fetchOtwPlayAdminRelease = () =>
  adminRequest<OtwPlayAdminReleaseReadResponse>(
    apiRoutes.otwPlay.admin.release.build(),
  );

export const updateOtwPlayAdminRelease = (
  json: OtwPlayAdminReleaseRequest,
) =>
  adminRequest<OtwPlayAdminReleaseCommandResponse>(
    apiRoutes.otwPlay.admin.release.build(),
    { method: "PATCH", json },
  );

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
export const deleteOtwPlaySong = (
  id: string,
  json: OtwPlayAdminExpectedVersionRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<{ id: string }>>(
    apiRoutes.otwPlay.admin.deleteSong.build(id),
    { method: "DELETE", json },
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
export const deleteOtwPlayPerformance = (
  id: string,
  json: OtwPlayAdminExpectedVersionRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<{ id: string }>>(
    apiRoutes.otwPlay.admin.deletePerformance.build(id),
    { method: "DELETE", json },
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
  adminRequest<OtwPlayAdminSourceRecheckResponse>(
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

export const approveOtwPlayProposal = (
  id: string,
  json: OtwPlayAdminApproveProposalRequest,
) =>
  adminRequest<OtwPlayAdminCommandResponse<OtwPlayAdminProposalDto>>(
    apiRoutes.otwPlay.admin.approveSubmission.build(id),
    { method: "POST", json },
  );
