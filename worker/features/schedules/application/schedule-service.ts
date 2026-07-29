import type { SaveScheduleResult } from "../../../../contracts/schedules";
import type {
  ScheduleActor,
  ScheduleWriteInput,
} from "../domain/schedule";
import { authorizeScheduleWrite } from "./authorize-schedule-write";
import type {
  ScheduleWriteAuthorizationPolicy,
  ScheduleWriteOperation,
} from "./ports/schedule-write-authorization-policy";
import type {
  ScheduleQuery,
  ScheduleQueryRepository,
} from "./ports/schedule-query-repository";
import type { ScheduleWriteRepository } from "./ports/schedule-write-repository";
import { saveSchedule } from "./save-schedule";

export class ScheduleService {
  private readonly queryRepository: ScheduleQueryRepository;
  private readonly writeRepository: ScheduleWriteRepository;
  private readonly authorizationPolicy: ScheduleWriteAuthorizationPolicy;

  constructor(
    queryRepository: ScheduleQueryRepository,
    writeRepository: ScheduleWriteRepository,
    authorizationPolicy: ScheduleWriteAuthorizationPolicy,
  ) {
    this.queryRepository = queryRepository;
    this.writeRepository = writeRepository;
    this.authorizationPolicy = authorizationPolicy;
  }

  read(query: ScheduleQuery) {
    return this.queryRepository.read(query);
  }

  canWrite(operation: ScheduleWriteOperation, actor: ScheduleActor) {
    return authorizeScheduleWrite(this.authorizationPolicy, {
      operation,
      actor,
    });
  }

  save(
    input: ScheduleWriteInput,
    actor: ScheduleActor,
  ): Promise<SaveScheduleResult> {
    return saveSchedule(this.writeRepository, input, actor);
  }

  create(input: ScheduleWriteInput, actor: ScheduleActor) {
    return this.writeRepository.create(input, actor);
  }

  update(input: ScheduleWriteInput, actor: ScheduleActor) {
    return this.writeRepository.update(input, actor);
  }

  delete(id: number, actor: ScheduleActor) {
    return this.writeRepository.delete(id, actor);
  }
}
