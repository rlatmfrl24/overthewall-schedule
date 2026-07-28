import type {
  UpdateLogDto,
  UpdateLogPageResponseDto,
  UpdateLogQuery,
} from "../../../../../contracts/audit";

export interface UpdateLogReadOptions {
  limit: number;
  page: number | null;
  pageSize: number | null;
  sort: UpdateLogQuery["sort"];
}

export interface UpdateLogRepository {
  read(
    options: UpdateLogReadOptions,
  ): Promise<UpdateLogDto[] | UpdateLogPageResponseDto>;
  delete(id: number): Promise<void>;
}
