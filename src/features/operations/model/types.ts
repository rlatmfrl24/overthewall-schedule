import type {
  AutoUpdateOperationRunDto,
  AutoUpdateRunDetailDto,
  AutoUpdateRunResultDto,
  DataRetentionCategory,
  DataRetentionPolicyStatusDto,
  DataRetentionPruneResponseDto,
  NaverCafeCheckNowResponseDto,
  NaverCafeOperationSourceDto,
  NaverCafeSourceCheckStatus,
  OperationsIssueDto,
  OperationsStatusLevel,
  OperationsStatusResponseDto,
  XCollectionOperationRunDto,
  XCollectionRunResultDto,
  XDailyUsageSummaryDto,
  XForceRefreshPathSummaryDto,
  XOperationUsageSummaryDto,
  XUsageAggregateDto,
} from "@contracts/operations";

export type AutoUpdateOperationRun = AutoUpdateOperationRunDto;
export type AutoUpdateRunDetail = AutoUpdateRunDetailDto;
export type AutoUpdateRunResult = AutoUpdateRunResultDto;
export type DataRetentionPolicyStatus = DataRetentionPolicyStatusDto;
export type DataRetentionPruneResponse = DataRetentionPruneResponseDto;
export type NaverCafeCheckNowResponse = NaverCafeCheckNowResponseDto;
export type NaverCafeOperationSource = NaverCafeOperationSourceDto;
export type OperationsIssue = OperationsIssueDto;
export type OperationsStatusResponse = OperationsStatusResponseDto;
export type XCollectionOperationRun = XCollectionOperationRunDto;
export type XCollectionRunResult = XCollectionRunResultDto;
export type XDailyUsageSummary = XDailyUsageSummaryDto;
export type XForceRefreshPathSummary = XForceRefreshPathSummaryDto;
export type XOperationUsageSummary = XOperationUsageSummaryDto;
export type XUsageAggregate = XUsageAggregateDto;
export type {
  DataRetentionCategory,
  NaverCafeSourceCheckStatus,
  OperationsStatusLevel,
};
