export type OperationsActor = {
  actorId: string | null;
  actorName: string | null;
  actorIp: string | null;
};

export interface OperationsApplication {
  getStatus(windowHours: number): Promise<unknown>;
  checkNaverCafe(actor: OperationsActor): Promise<unknown>;
  getDataRetentionStatus(): Promise<unknown>;
  pruneDataRetention(
    dryRun: boolean,
    actor: OperationsActor,
  ): Promise<unknown>;
}
