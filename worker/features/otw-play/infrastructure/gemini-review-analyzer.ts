import {
  AiReviewError,
  type AiReviewAnalyzer,
  type AiReviewInput,
} from "../application/ports/ai-review";
import { buildAiReviewPrompt } from "./ai-review-prompt";
import { parseAiReviewResult } from "../domain/ai-review-result";
import { AI_REVIEW_FIELDS } from "@contracts/otw-play-ai-review";
import {
  OTW_PLAY_PARTICIPANT_ROLES,
  OTW_PLAY_PARTICIPATION_TYPES,
} from "@contracts/otw-play";

const string = { type: "string" };
const strings = { type: "array", items: string };
const enumeration = (values: readonly string[]) => ({
  type: "string",
  enum: values,
});
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
const person = { name: string, sourceNames: strings, entityKind: enumeration(["person", "group"]) };
const array = (items: unknown) => ({ type: "array", items });
const timecode = { type: "string", description: "Original video timestamp as MM:SS or HH:MM:SS, e.g. 02:34. Never an integer encoded as MMSS." };
export const AI_REVIEW_SCHEMA = object({
  videoAnalyzed: { type: "boolean" },
  warnings: strings,
  songs: array(
    object({
      warnings: strings,
      values: object(
        {
          song: object({
            title: string,
            alternateTitles: strings,
            originalArtists: array(object(person)),
            tags: strings,
          }),
          participants: array(
            object({
              ...person,
              role: enumeration(OTW_PLAY_PARTICIPANT_ROLES),
            }),
          ),
          classification: object({
            relationType: enumeration(["original", "cover", "singing_clip"]),
            releaseType: enumeration([
              "official_mv",
              "official_video",
              "broadcast",
            ]),
          }),
          participationType: enumeration(OTW_PLAY_PARTICIPATION_TYPES),
          performanceTags: strings,
          segment: object({ startTime: timecode, endTime: timecode, observation: string }),
          broadcastDate: object({ performedOn: string, dateEvidence: string }),
          originalUrl: string,
          extent: object({ value: enumeration(["full", "partial"]), observation: string, timecode }),
        },
        [],
      ),
      evidence: object(
        Object.fromEntries(
          AI_REVIEW_FIELDS.map((key) => [
            key,
            array(
              object({
                source: enumeration([
                  "title",
                  "description",
                  "metadata",
                  "video",
                ]),
                text: string,
                timecode: { type: ["string", "null"], description: "MM:SS or HH:MM:SS for video, null for text evidence." },
              }),
            ),
          ]),
        ),
        [],
      ),
    }),
  ),
});

export class GeminiReviewAnalyzer implements AiReviewAnalyzer {
  private readonly key: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;
  constructor(key: string, model: string, fetcher: typeof fetch = fetch) {
    this.key = key;
    this.model = model;
    this.fetcher = fetcher;
  }
  async analyze(input: AiReviewInput, model = this.model) {
    const { video, range } = input;
    const prompt = buildAiReviewPrompt(input);
    let response: Response;
    const fetcher = this.fetcher;
    try {
      response = await fetcher(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.key,
          },
          signal: AbortSignal.timeout(180000),
          body: JSON.stringify({
            model,
            store: false,
            generation_config: {
              max_output_tokens: 16384,
              thinking_level: "low",
            },
            input: [
              {
                type: "video",
                uri: `https://www.youtube.com/watch?v=${video.videoId}`,
                processing: {
                  type: "static",
                  fps: 1,
                  ...(range
                    ? {
                        start_offset: range.startSeconds,
                        end_offset: range.endSeconds,
                      }
                    : {}),
                },
              },
              { type: "text", text: prompt },
            ],
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: AI_REVIEW_SCHEMA,
            },
          }),
        },
      );
    } catch (error) {
      throw new AiReviewError(
        error instanceof Error && /timeout|abort/i.test(error.name)
          ? "timeout"
          : "network",
        "Gemini 연결이 중단되었습니다.",
        502,
        true,
      );
    }
    if (!response.ok) {
      if (response.status === 429) {
        const failure = await response.clone().json().catch(() => null) as { error?: { message?: unknown } } | null;
        const message = failure?.error?.message;
        if (typeof message === "string" && /prepayment credits are depleted/i.test(message)) {
          throw new AiReviewError("provider_credit_exhausted", "Gemini 프로젝트의 선불 크레딧이 소진되었습니다. AI Studio에서 해당 프로젝트 잔액을 충전한 뒤 재분석하세요.", 502, false);
        }
      }
      const retry = response.status === 429 || response.status >= 500;
      // Never include upstream response bodies: they may echo input or credentials.
      throw new AiReviewError(
        response.status === 429
          ? "provider_rate_limit"
          : response.status === 401 || response.status === 403
            ? "provider_auth"
            : response.status >= 500
              ? "provider_unavailable"
              : "provider_input",
        response.status === 429
          ? "Gemini 호출 할당량 제한(HTTP 429)에 도달했습니다. AI Studio의 프로젝트 할당량과 결제 설정을 확인하세요."
          : retry
          ? "Gemini가 일시적으로 요청을 처리하지 못했습니다."
          : "Gemini 인증 또는 영상 입력을 확인하세요. 입력 한도 초과 시 분석 구간을 줄여 주세요.",
        502,
        retry,
      );
    }
    let body: {
      status?: string;
      outputs?: { type: string; text?: string }[];
      steps?: { type?: string; content?: { type: string; text?: string }[] }[];
      usage?: { total_input_tokens?: number; total_output_tokens?: number };
    };
    try {
      body = await response.json();
    } catch (error) {
      const invalid = error instanceof SyntaxError;
      throw new AiReviewError(
        invalid ? "invalid_result" : "network",
        invalid
          ? "Gemini 응답 형식을 확인할 수 없습니다."
          : "Gemini 응답 수신이 중단되었습니다.",
        502,
        !invalid,
      );
    }
    if (body.status && body.status !== "completed")
      throw new AiReviewError(
        "provider_incomplete",
        "Gemini가 분석을 완료하지 못했습니다.",
        502,
      );
    const parts =
      body.outputs ??
      body.steps
        ?.filter((s) => s.type === "model_output")
        .flatMap((s) => s.content ?? []) ??
      [];
    const output = parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("");
    try {
      return {
        result: parseAiReviewResult(JSON.parse(output), input),
        usage: body.usage
          ? {
              inputTokens: body.usage.total_input_tokens ?? 0,
              outputTokens: body.usage.total_output_tokens ?? 0,
            }
          : null,
      };
    } catch {
      throw new AiReviewError(
        "invalid_result",
        "Gemini 결과 형식 또는 근거를 확인할 수 없습니다.",
        502,
      );
    }
  }
}
