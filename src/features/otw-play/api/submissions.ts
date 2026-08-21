import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type {
  OtwPlayCreateSubmissionRequest,
  OtwPlayCreateSubmissionResponse,
  OtwPlayMemberSubmissionDto,
  OtwPlayMemberSubmissionPageDto,
  OtwPlaySubmissionPreflightDto,
  OtwPlaySubmissionPreflightRequest,
  OtwPlayUpdateSubmissionRequest,
  OtwPlayWithdrawSubmissionRequest,
} from "@contracts/otw-play";
import { apiFetch } from "@/shared/api/client";

const memberRequest = <T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
) => apiFetch<T>(path, { ...init, auth: "required" });

export const preflightOtwPlaySubmission = (
  json: OtwPlaySubmissionPreflightRequest,
) =>
  memberRequest<{ data: OtwPlaySubmissionPreflightDto }>(
    apiRoutes.otwPlay.submissions.preflight.build(),
    { method: "POST", json },
  ).then((response) => response.data);

export const createOtwPlaySubmission = (
  json: OtwPlayCreateSubmissionRequest,
) =>
  memberRequest<OtwPlayCreateSubmissionResponse>(
    apiRoutes.otwPlay.submissions.create.build(),
    { method: "POST", json },
  );

export const fetchMyOtwPlaySubmissions = (options: {
  limit?: number;
  cursor?: string | null;
} = {}) => {
  const search = new URLSearchParams();
  if (options.limit !== undefined) search.set("limit", String(options.limit));
  if (options.cursor) search.set("cursor", options.cursor);
  return memberRequest<{ data: OtwPlayMemberSubmissionPageDto }>(
    withRouteSearch(apiRoutes.otwPlay.submissions.mine.build(), search),
  ).then((response) => response.data);
};

export const fetchMyOtwPlaySubmission = (id: string) =>
  memberRequest<{ data: OtwPlayMemberSubmissionDto }>(
    apiRoutes.otwPlay.submissions.detail.build(id),
  ).then((response) => response.data);

export const updateOtwPlaySubmission = (
  id: string,
  json: OtwPlayUpdateSubmissionRequest,
) =>
  memberRequest<{ data: OtwPlayMemberSubmissionDto }>(
    apiRoutes.otwPlay.submissions.detail.build(id),
    { method: "PATCH", json },
  ).then((response) => response.data);

export const withdrawOtwPlaySubmission = (
  id: string,
  json: OtwPlayWithdrawSubmissionRequest,
) =>
  memberRequest<{ data: OtwPlayMemberSubmissionDto }>(
    apiRoutes.otwPlay.submissions.withdraw.build(id),
    { method: "POST", json },
  ).then((response) => response.data);
