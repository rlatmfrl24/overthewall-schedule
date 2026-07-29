import type {
  DDayRepository,
  DDayWriteInput,
} from "./ports/dday-repository";

export const listDDays = (repository: DDayRepository) => repository.list();

export const createDDay = (
  repository: DDayRepository,
  input: DDayWriteInput,
) => repository.create(input);

export const updateDDay = (
  repository: DDayRepository,
  id: number,
  input: DDayWriteInput,
) => repository.update(id, input);

export const deleteDDay = (repository: DDayRepository, id: number) =>
  repository.remove(id);
