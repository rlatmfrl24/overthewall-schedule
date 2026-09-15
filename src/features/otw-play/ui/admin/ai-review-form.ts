import { useEffect, useRef, useState } from "react";
import {
  AI_REVIEW_FIELDS,
  type AiReviewField,
  type AiReviewFields,
  type AiReviewPerson,
  type AiReviewSuggestion,
} from "@contracts/otw-play-ai-review";
import type { OtwPlayAdminCatalogSubjectInput } from "@contracts/otw-play";

export type AiFormSnapshots = Record<AiReviewField, unknown>;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export const canAutoApplyAiField = (
  touched: boolean,
  protectedValue: boolean,
  before: unknown,
  current: unknown,
) => !touched && !protectedValue && equal(before, current);
export const aiPersonSelection = (
  p: AiReviewPerson,
): { key: string; label: string; subject: OtwPlayAdminCatalogSubjectInput } => {
  if (!p.subject) throw new Error("기존 인물을 먼저 선택하세요.");
  const subject = p.subject;
  return {
    key:
      subject.kind === "entity"
        ? `entity:${subject.entityId}`
        : subject.kind === "member"
          ? `member:${subject.memberUid}`
          : `external:${subject.clientKey}`,
    label: p.name,
    subject,
  };
};
export function useAiReviewForm(
  scope: string,
  snapshots: AiFormSnapshots,
  apply: (field: AiReviewField, value: AiReviewFields[AiReviewField]) => void,
  restore: (field: AiReviewField, value: unknown) => void,
  protectedFields: AiReviewField[] = [],
) {
  const current = useRef(snapshots);
  current.current = snapshots;
  const touched = useRef(new Set<AiReviewField>());
  const epoch = useRef<Record<string, number>>({});
  const baseline = useRef<AiFormSnapshots | null>(null);
  const previous = useRef<
    Partial<Record<AiReviewField, { value: unknown; epoch: number }>>
  >({});
  const [applied, setApplied] = useState<AiReviewField[]>([]);
  useEffect(() => {
    touched.current.clear();
    epoch.current = {};
    baseline.current = null;
    previous.current = {};
    setApplied([]);
  }, [scope]);
  const touch = (field: AiReviewField) => {
    touched.current.add(field);
    epoch.current[field] = (epoch.current[field] ?? 0) + 1;
    setApplied((old) => old.filter((k) => k !== field));
  };
  const begin = () => {
    baseline.current = structuredClone(current.current);
  };
  const receive = (
    suggestion: AiReviewSuggestion,
    manual?: AiReviewField | "all",
  ) => {
    const added: AiReviewField[] = [];
    for (const field of AI_REVIEW_FIELDS) {
      const value = suggestion.values[field];
      if (
        value === undefined ||
        (manual && manual !== "all" && manual !== field)
      )
        continue;
      if (
        field === "song" &&
        suggestion.values.song &&
        !suggestion.values.song.existingSongId &&
        (suggestion.values.song.candidates.length > 0 ||
          suggestion.values.song.originalArtists.some((p) => !p.subject))
      )
        continue;
      if (
        field === "participants" &&
        suggestion.values.participants?.some((p) => !p.subject)
      )
        continue;
      if (
        !manual &&
        (!baseline.current ||
          !canAutoApplyAiField(
            touched.current.has(field),
            protectedFields.includes(field),
            baseline.current[field],
            current.current[field],
          ))
      )
        continue;
      previous.current[field] = {
        value: structuredClone(current.current[field]),
        epoch: epoch.current[field] ?? 0,
      };
      apply(field, value);
      added.push(field);
    }
    setApplied((old) => Array.from(new Set([...old, ...added])));
  };
  const undo = () => {
    for (const field of AI_REVIEW_FIELDS) {
      const p = previous.current[field];
      if (p && p.epoch === (epoch.current[field] ?? 0)) {
        restore(field, p.value);
        delete previous.current[field];
      }
    }
    setApplied([]);
  };
  return { touch, begin, receive, undo, applied, snapshots };
}
export type AiReviewForm = ReturnType<typeof useAiReviewForm>;
