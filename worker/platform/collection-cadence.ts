/** Only the owning scheduled run can supply a cadence anchor; actual times stay unchanged. */
export function collectionCadenceAnchor(scheduledFor: number | null | undefined, actualAt: number): number {
  return typeof scheduledFor === "number" && Number.isSafeInteger(scheduledFor) &&
    scheduledFor > 0 && scheduledFor <= actualAt ? scheduledFor : actualAt;
}
