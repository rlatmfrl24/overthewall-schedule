import type {
  UpdateLogReadOptions,
  UpdateLogRepository,
} from "./ports/update-log-repository";

export class UpdateLogService {
  private readonly repository: UpdateLogRepository;

  constructor(repository: UpdateLogRepository) {
    this.repository = repository;
  }

  read(options: UpdateLogReadOptions) {
    return this.repository.read(options);
  }

  delete(id: number) {
    return this.repository.delete(id);
  }
}
