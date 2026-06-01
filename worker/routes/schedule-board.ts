import { getDb } from "../db";
import { getScheduleBoard } from "../repositories/schedule-board";
import { badRequest, json, methodNotAllowed } from "../utils/helpers";
import type { Env } from "../types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_BOARD_CACHE_CONTROL = "no-store";

export const handleScheduleBoard = async (request: Request, env: Env) => {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  if (!startDate || !endDate) {
    return badRequest("startDate and endDate query parameters are required");
  }

  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    return badRequest("startDate and endDate must use YYYY-MM-DD");
  }

  if (startDate > endDate) {
    return badRequest("startDate must be before or equal to endDate");
  }

  const board = await getScheduleBoard(getDb(env), startDate, endDate);
  return json(board, 200, {
    headers: {
      "Cache-Control": SCHEDULE_BOARD_CACHE_CONTROL,
    },
  });
};
