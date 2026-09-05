export interface RecordedChange {
  key: string;
  before: string;
  after: string;
}

const displayValue = (value: unknown): string =>
  value === null ? "미설정" : value === "" ? "빈 값" : typeof value === "object" ? JSON.stringify(value) : String(value);

// Only show values actually recorded by the command; never infer an older value.
export function readRecordedChanges(detail: string | null): RecordedChange[] {
  if (!detail) return [];
  try {
    const parsed: unknown = JSON.parse(detail);
    if (!parsed || typeof parsed !== "object" || !("changes" in parsed) || !Array.isArray(parsed.changes)) return [];
    return parsed.changes.flatMap((change: unknown) => {
      if (!change || typeof change !== "object" || !("key" in change) || typeof change.key !== "string") return [];
      return [{key: change.key, before: "previousValue" in change ? displayValue(change.previousValue) : "기록 없음", after: "nextValue" in change ? displayValue(change.nextValue) : "기록 없음"}];
    });
  } catch {
    return [];
  }
}
