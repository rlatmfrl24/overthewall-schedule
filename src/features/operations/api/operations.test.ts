import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDataRetentionStatus,
  fetchOperationsStatus,
  runAutoUpdateNow,
  runDataRetentionPrune,
  runNaverCafeCheckNow,
  runXCollectionNow,
} from "./operations";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({
  apiFetch: apiFetchMock,
}));

describe("operations api", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("운영 상태 조회의 기본·지정 window를 query에 반영한다", async () => {
    await fetchOperationsStatus();
    await fetchOperationsStatus(72);

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/operations/status?windowHours=24",
      { cache: "no-store" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/operations/status?windowHours=72",
      { cache: "no-store" },
    );
  });

  it("수동 수집·업데이트 endpoint를 POST로 호출한다", async () => {
    await runNaverCafeCheckNow();
    await runAutoUpdateNow();
    await runXCollectionNow();

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/operations/naver-cafe/check-now",
      { method: "POST" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/settings/run-now",
      { method: "POST" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/settings/x-collection/run-now",
      { method: "POST" },
    );
  });

  it("데이터 보존 status와 dry-run·실행 prune을 구분한다", async () => {
    await fetchDataRetentionStatus();
    await runDataRetentionPrune({ dryRun: true });
    await runDataRetentionPrune({ dryRun: false });

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/operations/data-retention/status",
      { cache: "no-store" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/operations/data-retention/prune?dryRun=true",
      { method: "POST" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/operations/data-retention/prune?dryRun=false",
      { method: "POST" },
    );
  });
});
