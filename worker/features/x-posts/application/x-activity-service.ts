import type { XActivityStatusDto } from "@contracts/x-activity";

export class XActivityError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 409) { super(code); this.code = code; this.status = status; }
}

export interface XActivityService {
  status(): Promise<XActivityStatusDto>;
  start(): Promise<XActivityStatusDto>;
  stop(): Promise<XActivityStatusDto>;
  accept(body: unknown): Promise<boolean>;
  process(eventId: string): Promise<void>;
  deliver(eventId: string): Promise<void>;
  reconcile(canProcess?: boolean): Promise<void>;
}
