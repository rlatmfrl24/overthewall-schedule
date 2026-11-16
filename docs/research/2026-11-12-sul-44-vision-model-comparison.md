# SUL-44 일정표 이미지 인식 모델 비교 조사

후속 사용자 승인으로 Flash-Lite minimal을 기본 연결하고 로컬 실제 편집·적용을 검증했다. 현재는 [확대·분할 인식 검증](../reports/2026-11-12-sul-44-image-import-implementation.md#일정-영역-확대분할과-제목부제-분리-검증)이 최신 앱 상태를 소유한다. 아래 Luna 기본값·제품 미변경은 **비교 종료 당시** 상태다. 사용자가 화요일 원문을 **‘문 스위퍼즈’**로 확인해 앞선 AI 참조 ‘룬’을 정정했다. 모든 기존 모델 응답을 동일 기준으로 오프라인 재채점했으며 추가 모델 호출·제품 문자열 치환은 없었다. 후속 결과에도 다른 작은 글자 오독이 있어 1회 표본 성적을 반복 정확도 보장으로 사용하지 않는다.

- 확인일: 2026-11-12 KST. 로컬 HEAD `2a9e0077`과 미커밋 SUL-44 구현을 읽었다.
- 범위: 공식 문서·공개 API 조사 후, 사용자가 지정한 원본 4장으로 7개 모델군·9개 설정을 실제 비교했다. 연구용 기존 키를 서버 프로세스에서만 읽었으며 값은 출력하지 않았다. 제품 코드·기본 모델·운영 DB는 변경하지 않았다.
- 목적: 현재 850×478 한국어 일정표의 작은 제목 누락·오독을 줄이면서, 업로드 뒤 20초·자동 재시도/전환 없음·사이트별 월 $0.50을 지킬 후보를 고른다. [현재 상태](../current-work.md), [확정 D1~D7](../superpowers/specs/2026-11-12-sul-44-schedule-image-import-design.md)

## 결론

**빠르게 읽고 사용자가 편집하는 현재 제품에는 `gemini-3.5-flash-lite`, 추론 `minimal`, 이미지 `high`를 1차 채택 후보로 선정한다.** 같은 원본 4장 모두 현재 파서에서 사용할 수 있는 초안을 반환했고, 멤버표 3장의 모델 응답 중앙값은 2.455초, 통합표 1장은 6.383초였다. 사용자 확인으로 정정한 참조에서 핵심 제목은 **24/25**, 전체 제목은 17/21이 일치했다. 이전 25/25 표기는 잘못된 AI 참조에 따른 집계였다. 다만 요일이 연결되지 않은 휴방 2건·18:00 입력 보류 1건이 남았고, 인쇄된 연도에 따른 날짜 5건도 보류했다. 전체 인식률 100%나 D7 합격이라는 뜻이 아니다.

**날짜까지 더 많이 자동 입력하는 비교 후보는 `gemini-3.8-flash`, `low`다.** 요일·날짜 안전성·시간·상태 동시 일치는 54/56으로 Flash-Lite의 48/56보다 높았다. 차이 6건 중 5건은 Flash-Lite의 안전한 날짜 보류이며, 날짜를 제외하면 각각 54/56·53/56이다. Flash는 멤버표 6.663초·통합표 11.177초로 확정 목표 5초·10초를 넘었다. 두 후보의 모델 비용은 모두 월 $0.50 안이므로 가격만으로 Flash를 제외한 것이 아니다. **D2의 기준 주 일괄 보정과 빠른 초안 편집이라는 목적**에 맞춰 Flash-Lite를 우선했다. 실제 수정 시간이 더 짧다는 증거는 아직 없으므로 사용자 작업 시간 검증이 이 선택을 뒤집을 수 있다. [D2·D6·D7](../superpowers/specs/2026-11-12-sul-44-schedule-image-import-design.md)

월 30장 중 멤버표 26장·통합표 4장으로 가정하면 Flash-Lite 약 **$0.072**, Flash 약 **$0.127**이다. 표본과 같은 3:1 비율이면 각각 $0.088·$0.138이다. 충전 수수료·세금·재인식·다른 서비스 비용은 별도다. 이번 선정은 연구 결론이며 **앱의 Luna 기본값을 교체하거나 운영을 변경하지 않았다.**

## 1. 포함 기준과 실제 호출 후보

이미지 입력, 자유로운 새 제목을 담는 JSON 출력, 관리형 유료 API, 작은 월 사용량에서 별도 서버 고정비가 없는 모델을 찾았다. 모든 공개 모델을 실측했다는 뜻이 아니다. 현재 공개 목록·단가·서버 설정을 기준으로 다른 공급자와 가격 구간을 대표하는 후보를 고른 것이다.

금액은 **USD / 100만 입력·출력 토큰, 일반 동기 호출, 캐시 할인 제외**다. 이미지·추론 토큰도 공급자의 과금 규칙에 따라 포함한다. 표의 지원은 공개 문서/카탈로그 지원이며 현재 사용자 키의 권한·잔액·호출 성공과 구분한다.

| 역할 | 직접 API 모델 ID | 입력 / 출력 | 이미지·JSON 근거 | 첫 비교 설정 제안 |
| --- | --- | ---: | --- | --- |
| 현재 기준 | `gpt-6-luna` | $0.10 / $0.50 | 이미지·Structured Outputs 지원. [모델](https://developers.openai.com/api/docs/models/gpt-6-luna), [요금](https://developers.openai.com/api/docs/pricing) | 현행 `none`, 추가 `low`; 현행 이미지 `detail: high` 유지 |
| 저비용 직접 경쟁 | `claude-haiku-5-5` | $0.10 / $0.50, 입력 100K 이하 | 이미지·JSON Schema 출력. 100K 초과는 $0.50 / $2.50. [모델](https://platform.claude.com/docs/en/models/haiku-5-5/overview), [요금](https://platform.claude.com/docs/en/about-claude/pricing), [JSON](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) | 실제 비교는 thinking disabled, effort 별도 지정 없음 |
| 다른 저비용 비전 | `gemini-3.5-flash-lite` | $0.30 / $2.50 | 이미지·Structured Outputs 지원. [모델](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite), [요금](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite) | `minimal`, 이미지 `high` |
| 더 높은 품질 비교 | `gemini-3.8-flash` | $0.75 / $3.75 | 이미지·Structured Outputs 지원. **2027-01-01부터 $1.50 / $7.50 예정.** [모델](https://aistudio.google.com/docs/models/gemini-3.8-flash), [요금](https://aistudio.google.com/docs/pricing#gemini-3.8-flash) | `low`; `minimal`은 미지원 오류 |
| OpenAI 비전 품질 비교 | `gpt-6.1-terra` | $1.00 / $5.00 | 시각 추론 용도, 이미지·Structured Outputs·none 지원. [모델](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [요금](https://developers.openai.com/api/docs/pricing) | `none`; 필요 시 별도 `low` |
| 상위 품질 기준 | `gpt-6.1-sol` | $2.00 / $10.00 | 이미지·Structured Outputs 지원, **none 미지원**. [모델](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 설정](https://developers.openai.com/api/docs/guides/latest-model), [요금](https://developers.openai.com/api/docs/pricing) | `low`; 작은 표의 실제 비용을 보고 유지 여부 결정 |
| Qwen 계열 저비용 비교 | `qwen3.8-flash` | $0.15 / $0.47 | Singapore International 일반 요금. 이미지 입력·JSON 지원, 비용 우선 추천 모델. [공식 선택 안내](https://www.alibabacloud.com/help/en/model-studio/text-generation-model), [요금](https://www.alibabacloud.com/help/en/model-studio/model-pricing), [공식 API](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-api-via-openai-responses) | 비추론 설정을 명시하고 수용 여부 확인; strict JSON 지원 공급자 고정 |

**공개 목록만 확인하고 호출하지 않은 대안:** `qwen/qwen3-vl-30b-a3b-instruct`는 이미지·`structured_outputs`를 표시하며 최저 $0.15 / $0.60이다. 실제 공급자는 `deepinfra/fp8`($0.15/$0.60), `novita/bf16`($0.20/$0.70) 등으로 다르다. 최신 Qwen3.8을 먼저 비교했고 추가 open-weight 모델이나 자체 GPU는 평가하지 않았다. [Qwen 공식 모델 카드](https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct), [현재 공급자 API](https://openrouter.ai/api/v1/models/qwen/qwen3-vl-30b-a3b-instruct/endpoints)

`qwen/qwen3-vl-8b-instruct`도 이미지·정형 출력이 공개 목록에 있지만 $0.25/$0.75로 위 30B MoE보다 목록 단가가 높다. 작은 파라미터 수만으로 비용·한국어 정확도가 우수하다고 판단하지 않아 본후보를 더 늘리지 않았다. [현재 모델 목록](https://openrouter.ai/api/v1/models)

## 2. 이미 가진 키로 비교할 수 있는 전송 경로

### 직접 API

| 공급자 | 호출 주소 | 필요한 서버 키·확인 |
| --- | --- | --- |
| OpenAI | `POST https://api.openai.com/v1/responses` | OpenAI 프로젝트 API 키. 이미지 base64와 `text.format` JSON Schema를 사용한다. [이미지 API 예시](https://developers.openai.com/api/docs/guides/images-vision) |
| Anthropic | `POST https://api.anthropic.com/v1/messages` | Claude Console API 키·API 버전 헤더. OpenAI/Google 키와 호환되지 않는다. [공식 API·인증](https://platform.claude.com/docs/en/api/overview) |
| Google | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` 또는 `/v1beta/interactions` | AI Studio의 Gemini API 키. 전송 API에 따라 이미지·스키마·thinking 필드명과 저장 정책이 다르다. 기존 `generateContent`를 사용하면 계층을 불필요하게 추가하지 않는다. [API](https://aistudio.google.com/api-reference/generate-content), [키](https://aistudio.google.com/docs/api-key), [Interactions thinking 예시](https://aistudio.google.com/docs/thinking) |
| Alibaba | 선택 지역의 Model Studio OpenAI 호환 API | 지역 전용 pay-as-you-go API 키. 다른 지역·Coding/Token Plan 전용 키를 대체로 사용하지 않는다. [키 종류와 지역](https://www.alibabacloud.com/help/en/model-studio/get-api-key), [지역·엔드포인트](https://www.alibabacloud.com/help/en/model-studio/regions/) |

### OpenRouter의 현재 공개 목록 확인

2026-11-12에 무인증 `GET /api/v1/models`와 해당 모델 `/endpoints`를 실제 조회했다. 아래 ID는 모두 `image` 입력과 `response_format`·`structured_outputs`를 표시했다. 이 목록 조회는 과금 인식 호출이 아니며 계정별 가용성 검증도 아니다. [실시간 전체 목록](https://openrouter.ai/api/v1/models)

| OpenRouter 정확 ID | 입력 / 출력 MTok | 비교에 쓸 확인된 공급자/주의 |
| --- | ---: | --- |
| `openai/gpt-6-luna` | $0.10 / $0.50 | 기존 OpenAI 직접 경로를 기준으로 삼는 것이 전송 차이를 줄인다 |
| `anthropic/claude-haiku-5.5` | $0.10 / $0.50 | `anthropic`에 `structured_outputs`가 있음. `google-vertex/global`, `azure/global`도 표시. [공급자 목록](https://openrouter.ai/api/v1/models/anthropic/claude-haiku-5.5/endpoints) |
| `google/gemini-3.5-flash-lite` | $0.30 / $2.50 | 직접 Gemini 키로 비교 가능 |
| `google/gemini-3.8-flash` | 목록 $0.825 / $4.125, `google-ai-studio` $0.75 / $3.75 | 모델 전체 목록과 개별 endpoint 단가가 다름. 실제 pin할 `google-ai-studio`는 직접 Google과 동일. [공급자 목록](https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints) |
| `openai/gpt-6.1-terra` | $1.00 / $5.00 | 직접 API와 목록 단가 동일 |
| `openai/gpt-6.1-sol` | $2.00 / $10.00 | 직접 API와 목록 단가 동일 |
| `qwen/qwen3.8-flash` | $0.15 / $0.47 | `alibaba`, `alibaba/us-east-1`; 실제 공급자 모델명 `qwen3.8-flash-20260826`. 둘 다 `structured_outputs` 표시. [공급자 목록](https://openrouter.ai/api/v1/models/qwen/qwen3.8-flash/endpoints) |

OpenRouter는 `POST https://openrouter.ai/api/v1/chat/completions`에 일반 OpenRouter API 키를 Bearer로 보낸다. 새 Anthropic 키 없이 Haiku를 평가할 수 있다. 모델 ID의 점·하이픈을 직접 API ID와 혼동하지 않는다. 계정 잔액·허용 공급자·이미지/스키마 조합이 실제로 수용되는지는 별도 확인해야 한다. [인증·지원 입력·주소](https://openrouter.ai/docs/faq)

**공정한 1회 비교 설정:** `model` 하나만 지정하고 해당 `/endpoints`에서 확인한 정확 공급자 slug를 `provider.only`와 `order`에 1개 지정한다. `allow_fallbacks: false`, `require_parameters: true`로 조용한 공급자 대체·지원하지 않는 스키마 필드 무시를 막는다. 예를 들어 Haiku는 `anthropic`, Qwen3.8은 `alibaba`를 명시한다. `models` 대체 목록·SDK 자동 재시도·응답 자동 수선은 사용하지 않는다. 이 설정도 공급자 내부 실행 횟수 전체를 증명하는 것은 아니므로 응답 ID·실제 model/provider·usage·청구 비용·오류를 기록한다. [라우팅 계약](https://openrouter.ai/docs/guides/routing/provider-selection), [스키마 지원이 공급자별이라는 설명](https://openrouter.ai/docs/guides/features/structured-outputs)

OpenRouter의 추론 `exclude`는 응답에서 추론 텍스트를 숨기는 설정이다. 추론 비용을 없애는 설정으로 해석하지 않는다. 비추론 비교는 모델이 허용하는 `reasoning.enabled: false` 또는 `reasoning.effort` 값을 사용하고 사용량으로 확인한다. [추론 설정·과금·Anthropic 필드 변환](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)

현재 비교에서 사용할 정확 pin은 OpenAI 3종 `openai`, Gemini 2종 `google-ai-studio`, Haiku `anthropic`, Qwen3.8 `alibaba`다. 모두 각각의 공개 `/endpoints` 응답에 이미지 입력과 `structured_outputs`·`reasoning` 지원이 있다. OpenRouter JSON은 Luna `reasoning:{effort:"none"}`/`{effort:"low"}`, Terra `{effort:"none"}`, Sol `{effort:"low"}`, Gemini Lite `{effort:"minimal"}`, Gemini3.8 `{effort:"low"}`, Haiku `{enabled:false}`, Qwen `{enabled:false}`를 첫 비교 설정으로 삼는다. Haiku adaptive low는 `{effort:"low"}`로 별도 조건이다. OpenRouter의 `enabled:false`는 Anthropic native `thinking:{type:"disabled"}`에 대응한다. 키 권한은 별도 `GET https://openrouter.ai/api/v1/key`의 일반 Bearer 인증으로 확인하며 `label`·키 값·사용자 식별은 결과 문서에 노출하지 않는다. [키 정보 API](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key), [추론 매핑](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [공급자 목록 URL 형식](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints)

## 3. 작은 한국어 제목에서 확인할 설정

- **Luna none/low와 image high/low는 별개다.** 비교 당시 Luna 구현은 `reasoning.effort: none`과 이미지 `detail: high`를 함께 사용했다. `low` 추론으로 바꿔도 입력 해상도 자체를 높인다는 뜻이 아니다. 후속 채택 모델의 연결은 [현재 reader](../../worker/features/schedules/infrastructure/flash-lite-schedule-image-reader.ts)를 따른다. [OpenAI 이미지 detail](https://developers.openai.com/api/docs/guides/images-vision)
- OpenAI는 한국어 등 비라틴 문자와 작은 글자에 한계가 있음을 명시하고, 지원 모델에서는 OCR에 `original` detail을 권한다. 다만 조사한 공통 크기 표에는 Luna/Terra/Sol의 개별 행이 없어 **GPT-6 Astra의 패치·리사이즈 공식을 Luna에 복사하지 않는다**. `original` 수용 여부·실제 input-token 계산·같은 원본 결과를 별도 확인한 뒤 판단한다. 현행 high를 실패로 단정하지 않는다. [이미지 sizing·한계](https://developers.openai.com/api/docs/guides/images-vision)
- Haiku 5.5는 Claude 4.7 이후 고해상도 계열로, 28×28 패치·긴 변 최대 2,576px·최대 4,784 visual tokens의 자동 처리다. 850×478 원본은 이 크기 한도를 넘지 않는다. 그래도 작은 글자 판독을 보장하지 않는다. 먼저 동일 원본을 보내고, 필요할 때만 원본+확대 영역을 별도 실험한다. 확대·자르기를 원본 1장 비교와 섞어 성능 향상으로 보고하지 않는다. [Claude 이미지 처리·품질 안내](https://platform.claude.com/docs/en/build-with-claude/vision)
- Haiku 5.5는 adaptive thinking이 기본이다. `thinking: {type: disabled}`는 effort low/medium/high에서 허용되며 xhigh/max에서는 오류다. `temperature`·`top_p`·`top_k`를 다른 모델에서 그대로 가져오지 않는다. JSON Schema 최초 사용 시 문법 컴파일 지연이 있으므로 **cold 요청을 실패/지연 집계에서 빼지 않는다**. [Haiku 변경점](https://platform.claude.com/docs/en/models/haiku-5-5/whats-new-haiku-5-5), [문법 컴파일](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Gemini 3 계열의 이미지 media resolution은 high 약 1,120토큰, ultra_high 약 2,240토큰이다. high를 먼저 비교하고 ultra_high는 실제 이득이 있을 때 별도 설정으로 평가한다. Flash-Lite는 minimal이 기본이며, 3.8 Flash는 low/medium/high를 지원하고 minimal은 오류다. Google의 minimal을 OpenAI none과 완전히 같은 연산량이라고 가정하지 않는다. [해상도](https://aistudio.google.com/docs/media-resolution), [thinking 지원표](https://aistudio.google.com/docs/thinking), [3.8 모델 제한](https://aistudio.google.com/docs/models/gemini-3.8-flash)
- Qwen3.8은 별도 VL로 바꾸지 않아도 이미지 입력을 지원한다. OpenRouter 모델 목록의 `structured_outputs`만으로 모든 공급자·스키마의 강제 준수를 보장하지 않는다. 정형 출력은 타입/문법 보조이며 날짜·제목의 사실 정확성과 누락은 원문 대조로 판단한다. [Qwen 안내](https://www.alibabacloud.com/help/en/model-studio/text-generation-model), [OpenRouter 공급자별 준수 차이](https://openrouter.ai/docs/guides/features/structured-outputs)

## 4. 30장 예상 비용과 상한

계산 예시는 기존 850×478 Luna 관측의 **입력 1,008·출력 410토큰**을 모든 모델에 가상 대입한 단가 비교다. **다른 모델의 실측값이 아니다.** 토크나이저·이미지 처리·추론량·주입 스키마가 달라 실제 사용량은 달라진다. 30장은 합계 예상량이며 사이트마다 30장이라고 사용량을 배증하지 않는다. [현재 실측 기록](../reports/2026-11-12-sul-44-image-import-implementation.md)

| 모델 | 예시 1회 | 예시 30회 | 현행 입력50K·출력12K를 모두 쓴 1회, 캐시 쓰기 가산 제외 |
| --- | ---: | ---: | ---: |
| Luna / Haiku 5.5 | $0.000306 | $0.00917 | $0.011 |
| Gemini 3.5 Flash-Lite | $0.001327 | $0.03982 | $0.045 |
| Gemini 3.8 Flash 직접 | $0.002294 | $0.06881 | $0.0825 |
| GPT-6.1 Terra | $0.003058 | $0.09174 | $0.11 |
| GPT-6.1 Sol | $0.006116 | $0.18348 | $0.22 |
| Qwen3.8 Flash | $0.000344 | $0.01032 | $0.01314 |
| 추가 Qwen3-VL 30B MoE | $0.000397 | $0.01192 | $0.0147 |

계산식은 `(입력토큰×입력단가 + 출력토큰×출력단가) / 1,000,000`이다. 위 단가는 1절·2절의 공식 요금과 공개 API에서 가져왔다. 표의 최악 요청 크기를 30회 사용하는 경우와 작은 표 30회는 다르다. Sol도 작은 표 수준에서는 월 $0.50 안이므로 단가만으로 제외하지 않는다. 큰 통합표와 low 추론 사용량이 늘면 최종 선택에서 탈락할 수 있다.

**통합 시 필요한 변경:** 현재 `reservedNanoUsd=12,250,000`과 모델/결과 타입·usage 정산은 Luna를 전제한다. 다른 단가·추론/캐시 쓰기 규칙의 모델을 붙이면서 이 예약액만 재사용하면 상위 모델의 선예약이 부족해진다. 모델을 채택할 때 해당 reader·모델 식별·프런트 전송 안내·단가·최대 예약·실사용 정산을 함께 바꿔야 한다. 현재 조사에서 바꾸지 않는다. [현행 한도](../../contracts/schedule-image-import.ts), [예산 처리](../../worker/features/schedules/infrastructure/d1-schedule-image-budget.ts)

API 사용량 가격과 계정 선결제액은 별개다. OpenRouter는 크레딧 구매 때 5.5%, 최소 $0.80의 수수료를 안내한다. 이번에는 기존 키의 인증·비교에 필요한 잔액을 확인해 사용했으며 충전·결제는 하지 않았다. 작은 실험의 모델 비용이 몇 센트라도 새 계정 선결제액이 그 수준이라는 뜻이 아니다. [OpenRouter 수수료](https://openrouter.ai/docs/faq)

## 5. 데이터 보관과 실제 운영 가능성

| 경로 | 문서에서 확인한 점 | 이 작업의 확인 한계 |
| --- | --- | --- |
| OpenAI 직접 | API 데이터는 기본 학습 미사용. `store:false`와 별도로 abuse 로그는 기본 최대30일이며 예외가 있음. [데이터 계약](https://developers.openai.com/api/docs/guides/your-data) | 현재 프로젝트의 ZDR 승인·조직 설정은 미조회. `store:false`를 외부 보관0일로 안내하면 안 됨 |
| Anthropic 직접 | ZDR은 조직별 승인·설정이며 모델·기능별 보관 예외가 있음. [공식 보관 문서](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) | Console 키/해당 계정 계약 미조회. 공개 지원이 현재 계정 ZDR을 의미하지 않음 |
| Gemini 직접 | 유료 서비스는 기본 제품 개선 미사용. 새 프로젝트의 Generate Content/Interactions 로그는 기본 활성일 수 있으며, 기본 보관 최대55일·설정 변경 가능. [요금의 데이터 사용 구분](https://aistudio.google.com/docs/pricing), [로그 정책](https://aistudio.google.com/docs/logs-policy) | 현재 Gemini 키의 유료 상태·프로젝트 생성일·로그 설정 미조회. 무료 호출을 같은 데이터 정책으로 대체하지 않음 |
| Alibaba 직접 | 입력·출력 저장이 존재하며 지역/배치 범위에 따라 저장·추론 위치가 다름. [개인정보](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/privacy-notice), [지역](https://www.alibabacloud.com/help/en/model-studio/regions/) | 정확한 보관기간·해당 계정 조건 미확인. 직접 도입은 이 조건 확인 뒤 판단 |
| OpenRouter | 일반 콘텐츠 로그는 기본 opt-in, 요청 메타데이터 저장. 실제 모델 공급자 정책은 별도이며 안전 보관·법적 예외가 존재. [자체 수집](https://openrouter.ai/docs/guides/privacy/data-collection), [공급자 정책](https://openrouter.ai/docs/guides/privacy/provider-logging) | public endpoints 응답에는 보관 정책 필드가 없었음. 필드 부재를 ZDR로 해석하지 않음 |

OpenRouter의 `provider.data_collection: deny`는 학습/수집 허용 공급자를 제한하는 선택이고, `provider.zdr:true`는 별도 필터다. 특히 2026년10월 이후 문서는 계정 설정이 Safety Retention을 허용하면 **zdr:true 요청도 안전 보관 endpoint에 갈 수 있음**을 설명한다. 엄격한 무보관이 필요하면 계정의 ZDR only와 정확 endpoint 정책까지 확인해야 하며, 해당 조건에서 모델이 사라져도 정책을 조용히 완화하지 않는다. [라우팅 필터](https://openrouter.ai/docs/guides/routing/provider-selection), [현재 ZDR·Safety Retention 계약](https://openrouter.ai/docs/guides/features/zdr)

다른 공급자를 채택하면 현재 UI의 OpenAI 외부 전송 안내도 실제 경로와 일치하도록 바꿔야 한다. 브라우저용 공개 키에 서버 비밀키를 옮기지 않는다. 연구용 직접 호출만 통과한 것을 기존 로그인→업로드→보정→명시적 적용→D1 확인 전체 흐름의 완료로 보고하지 않는다. [확정 D5·검증 기준](../superpowers/specs/2026-11-12-sul-44-schedule-image-import-design.md)

## 6. 실제 비교 조건과 참조 자료

사용자가 지정한 `C:\Users\rlatm\Downloads\schedule-example`의 원본을 직접 열어 확인했다. 리사이즈·crop·재압축·이미지별 프롬프트 수정은 하지 않았다.

| 파일 | 크기 | 참조 행 | 원본 SHA-256 |
| --- | --- | ---: | --- |
| `1794248571.png` | 850×478 | 7 | `37f72a5c6a72976c13696e08f38cc0980ba177a09d3b3ca5e0ab62538e635a7b` |
| `1794467171.png` | 850×478 | 7 | `0c087ff452e4523272884be9ba075f98eaf1df94b4ca3b0b8a84c816c3b0c752` |
| `1794467214.jpg` | 850×478 | 7 | `600be72a073c7f4db25b8071029235b4795a9bc17207fe022419606b90215343` |
| `1794467163.png` | 850×428 | 35 | `cf27d924689ae8cd48a7c6ad6b67b6402c88f9db493ef4ca2fe1012baafce76b` |

현재 reader의 지시와 결과 스키마를 재사용했다. 프롬프트 SHA-256은 `b4f0239647c77b9370c71808cb577f3d6557e41a72a8a20da720a04c96b942b7`이다. 기본 8설정은 OpenRouter에서 정확한 공급자를 고정해 순차 호출했고 자동 재시도·자동 모델/공급자 전환은 없었다. 원본·지시 의미·출력 필드·20초 제한을 공유했다. 입력 최대50K·출력 최대12K, 일반 요금·이미지 high를 사용했으며 소비 토큰은 모델마다 다르다.

참조는 **대부분 AI가 보조한 원본 대조 주석이며 전체가 사용자 확정 정답은 아니다.** 최초 참조를 호출 전에 고정했고, 재검토본에서 이름 철자·작은 글자의 확신을 조정했다. 그러나 그 과정에서 화요일을 ‘룬 스위퍼즈’로 둔 것이 잘못이었다. 사용자가 **‘문 스위퍼즈’**로 확인해 해당 한 필드만 정정한 v3를 만들고 모든 기존 응답을 재채점했다. 다른 필드까지 사용자 확인으로 승격하지 않았다. 불명확한 글자는 미채점을 유지했다.

참조 이력과 SHA-256은 다음과 같다. 원시 응답·이전 참조·이전 채점 파일은 보존했다. 변경은 정답 기준과 오프라인 집계에만 적용했으며 생성 요청 재실행은 없다.

- 최초 `vision-ground-truth.json`: `23844d90aecfe2492835088921754431dfae40d3ab723a1b18d2e93415a3be3c`
- AI 재검토 v2 `vision-ground-truth-reviewed.json`: `71b82fda759f4a5e0b82b8592aa253a3109bda103f15dcd9d4dbd2e3ae5cd1a9`
- 사용자 한 필드 확인 v3 `vision-ground-truth-user-confirmed.json`: `7a785ea6c6f6606dbf234331abcacc8cef4d77d668f037d65ab72708e4f44bee`
- 정정 채점: `vision-comparison-score-user-confirmed.json`. 본문 수치는 이 결과를 따른다. 비용·지연·행/날짜/시간 채점과 모델 선정은 달라지지 않았다.

- 핵심 제목 25개와 비어 있지 않은 전체 제목 21개만 제목 채점이 가능했다. 핵심 제목 일치는 해당 문자열이 결과에 포함되는지이며 전체 제목 완전 일치와 다르다. 공백·유니코드 조합만 정규화했고, 익숙한 단어로 바꾸거나 구두점을 제거하지 않았다.
- 요일별 결과와 참조를 최소 수정량으로 연결했다. 작은 멤버명은 모두 미채점이므로 **멤버별 귀속 오류·멤버 바뀜을 배제할 수 없다.** 통합표 35/35 표기도 멤버까지 정확하다는 뜻이 아니다.
- 날짜 포함 수치는 요일·날짜 안전성·시간·상태가 함께 맞은 행 수다. 연도가 없는 원본에서 임의로 연도를 채우면 실패다. 명확한 날짜를 null로 보류한 경우도 완전 자동 입력 성공에는 포함하지 않되, 잘못 확정한 값과는 구분했다. 날짜 제외 수치는 D2 보정 부담을 이해하기 위한 보조 지표이며 D7 기준을 바꾸지 않는다.
- 응답 시간은 요청 시작부터 전체 응답 JSON 수신까지다. native 경로는 사전 토큰 계산도 포함한다. 첫 토큰 시간이 아니다. **실제 앱의 업로드·화면 렌더링·사용자 수정 시간은 측정하지 않았다.** 현재 파서 수용 여부는 별도 검사했다.

### 호환성 오류와 예외 경로

Haiku는 최초 스키마의 `minimum/maximum`과 nullable 타입 배열·혼합 enum을 거절했다. 두 형태에서 4건씩 총8건 HTTP400이 발생했다. 허용값을 유지한 `weekday enum`과 nullable `anyOf`로 변환한 뒤 4장 모두 생성·파서 검사를 통과했다. 이8건은 설정 실패로 남겼으며 문자 인식 오답이나 성공으로 세지 않았다. 유효한 스키마의 cold 요청도 응답 시간에 포함했다. [Anthropic 스키마 제한](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations)

Sol 통합표는50K 입력 전체를 예약하면 실험 한도에 걸려 native OpenAI에서 실제 입력 토큰을 먼저 계산했다. 첫 시도는 클라이언트 준비 중 실패했고, 준비 오류 수정 후 별도 시도는20초가 지나 시간 초과됐다. 두 시도 모두 예약액을 보존했으며 첫 준비 실패는 모델 품질 판정에서 제외했다. 단일표3장은 공통 OpenRouter 경로다.

추가 Flash-Lite `low`는 native Gemini·동일 지시/의미 스키마·high 이미지로4장을 시도했다. 비용 예약을 위해 입력 토큰을 계산했고 출력 상한은10K였다. 앞선3장 모두 `STOP`으로 종료돼 출력 잘림은 없었다. 2장은 파서 수용, JPEG는 `PM 10:00` 등의 시간 형식으로 반환해 현재 파서가 거절했다. 통합표는 HTTP402 `RESOURCE_EXHAUSTED`로 실패했다. 이는 계정/공급자 한도 오류이며 이미지 판독 실패가 아니다. 정확한 결제·할당량 원인은 미확인이고 다시 호출하지 않았다. 전송 경로·추론 설정·출력 상한이 함께 달라 **minimal 대 low의 순수 실험으로 해석하지 않는다.** [Gemini API](https://aistudio.google.com/api-reference/generate-content/generate-content)

## 7. 실측 결과와 선정 근거

`수용`은 현재 결과 파서가 받은 초안이며 앱에 모델이 연결됐다는 뜻은 아니다. 미완료 모델의 분모·제목 지표는 **수용된 이미지에 한정**한다. 실패한 이미지의 일정을 정답이나 OCR 누락으로 세지 않았고 표본 수용률에 따로 반영했다.

| 모델·설정 | 수용 | 날짜 포함 동시 일치 | 날짜 제외 동시 일치 | 핵심 제목 | 전체 제목 | 단일표 중앙값 / 통합표 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Luna none | 4/4 | 39/56 | 39/56 | 14/25 | 12/21 | 4.506초 / 11.787초 |
| Luna low | 4/4 | 43/56 | 43/56 | 17/25 | 11/21 | 11.385초 / 17.308초 |
| Haiku disabled | 4/4 | 38/56 | 50/56 | 21/25 | 14/21 | 5.440초 / 10.234초 |
| **Flash-Lite minimal** | **4/4** | **48/56** | **53/56** | **24/25** | **17/21** | **2.455초 / 6.383초** |
| Flash3.8 low | 4/4 | 54/56 | 54/56 | 23/25 | 16/21 | 6.663초 / 11.177초 |
| Qwen3.8 disabled | 2/4 | 5/14 | 12/14 | 4/8 | 3/5 | 9.520초 / 20.012초 시간 초과 |
| Terra none | 3/4 | 15/21 | 15/21 | 8/9 | 4/5 | 6.461초 / 20.011초 시간 초과 |
| Sol low | 3/4 | 21/21 | 21/21 | 6/9 | 5/5 | 17.583초 / 20.006초 시간 초과 |
| Flash-Lite low, native | 2/4 | 12/14 | 12/14 | 7/8 | 5/5 | 2.783초 / HTTP402 실패 |

단일표 중앙값은 수용된 단일표만의 값이다. native Lite low는2장, Qwen은2장이므로 다른 모델의3장 중앙값과 표본이 다르다. 통합표는 모델별1장뿐이며 중앙값이나 p95의 안정적인 추정이 아니다. 사용자 확인 반영 후 제목 문자 오류율(CER)은 핵심/전체 기준으로 Luna none11.03%/20.99%, Luna low15.17%/15.43%, Haiku3.45%/5.56%, Lite minimal0.69%/2.47%, Flash low2.76%/4.32%다. CER 역시 명확한 제목과 수용된 응답에 한정한다.

실제 차이는 다음과 같다.

- **Flash-Lite minimal:** 56행 모두 반환했다. 하네 표의 휴방2행은 존재하지만 요일·날짜가 비어 연결할 수 없었고, 노란 표 금요일18:00은 미정으로 보류했다. 하네 표의 인쇄 연도2026에 따른 날짜5건도 null이므로 기준 주 확인이 필요하다. 날짜 미완성은 임의 연도를 채우는 오류보다 안전하며 D2의 일괄 보정에 맞는다. 그래도 완전 자동 입력 정답에는 포함하지 않았다.
- **Flash3.8 low:** 56행 모두 반환하고 인쇄 연도를 읽었으며18:00도 채웠다. 휴방2행의 요일 미연결은 공통으로 남았다. 통합표의 채점 가능한 요일·날짜 안전성·시간·상태는35/35였다. Lite도 같은 통합표에서35/35였으므로 두 모델 차이를 통합표 상태 오류로 잘못 설명하지 않는다. 제목 차이에는 `아.아.아.`와 `아,아,아,` 같은 구두점도 포함한다.
- **Haiku:** 한글 제목은 Luna보다 개선됐지만 연도가 없는 노란 표7행에2025년을 만들어 넣었고 하네 표 휴방2행은 실제로 빠졌다. 통합표에서 방송/휴방 오분류와 시간 보류도 있었다. 저렴하다는 이유로 우선 선정하지 않는다.
- **Luna:** none은2행, low는9행이 실제로 부족했다. low로 비용과 시간이 늘어도 핵심 제목/전체 제목·행 보존이 일관되게 개선되지 않았다.
- **Qwen·Terra·Sol:** 통합표가20초 내 완료되지 않았다. Qwen은 별도로 JPEG의 AM/PM 시간 형식이 현재 파서에서 거절됐다. Sol의 단일표3장 성적이 좋아도 통합표 실패와 느린 단일표 시간을 숨겨 전체 승자로 고르지 않는다.

**선정:** Flash-Lite minimal은 제목 보존·속도·행 수용의 균형이 가장 좋아 다음 실제 앱 검증에 사용할 우선 후보다. Flash3.8 low는 날짜 자동 입력 품질 비교 후보로 유지한다. 검증 자료가4장뿐이고 참조가 사용자 확정 정답이 아니므로 확정 운영 모델이나 D7 합격으로 올리지 않는다. 자동 fallback은 도입하지 않는다.

### 실제 사용량에 근거한 월 비용

| 모델·설정 | 4장 비교의 보고된 모델 비용 | 월30장, 멤버26+통합4 | 월30장, 표본과 같은3:1 비율 |
| --- | ---: | ---: | ---: |
| Luna none | $0.0017439 | $0.0108 | $0.0131 |
| Luna low | $0.0030114 | $0.0206 | $0.0226 |
| Haiku disabled | $0.0033430 | $0.0217 | $0.0251 |
| **Flash-Lite minimal** | **$0.0117730** | **$0.0719** | **$0.0883** |
| Flash3.8 low | $0.018431251 | $0.1266 | $0.1382 |

비용은 OpenRouter 응답의 `usage.cost`다. 월 계산은 단일표3장의 평균 비용×26+통합표 비용×4이며, 사용자가 말한 주1회 통합표를4주로 가정한 예측이다. 월5주·다른 이미지 크기/일정 수·사람의 재인식에 따라 달라진다. 미완료 모델은 빠진 통합표의 비용을0으로 간주하지 않고 월 비용 예측을 생략했다. 4절의 동일 토큰 가상 비교보다 이 실측 예측을 우선한다. Gemini3.8의2027-01-01 예정 인상이 그대로 적용되면 같은 혼합 비율의 약$0.1266도 약$0.2533으로 늘어난다. [예정 단가](https://aistudio.google.com/docs/pricing#gemini-3.8-flash)

### 실험 전체 예산과 실패 이력

이번 ledger는 **45시도**이며30건 파서 수용·2건 형식 불일치·9건 HTTP 오류·3건 시간 초과·1건 클라이언트 준비 실패다. 앞선 Luna3건을 포함해 예산 가드는48/60건으로 센다. 사전 토큰 계산은 생성 호출과 구분했다. 최초32조건에서 Sol 통합표가 최대 비용 예약 때문에 보류된 후 위 native 경로로 시도됐고, Haiku 스키마 오류8건도 기록에서 삭제하지 않았다.

- OpenRouter가 보고한 사용량 비용: **$0.076747797**. 오류 응답8건은 도구 없는 실패 시도에는 모델 토큰 비용을 부과하지 않는 공개 정책으로0으로 정리했다. 이는 요청별 청구서0 확인과 다르다. [실패 시도 요금 FAQ](https://openrouter.ai/pricing)
- native Gemini 앞선3장: 캐시 할인 없이 사용량으로 계산한 **$0.006355**. 유효2장뿐 아니라 파서가 거절한 JPEG도 포함했다. 청구서 확정액은 아니다.
- 앞선 Luna3건: 앱 추정 **$0.00135475**. 합계 보고/추정 모델 비용은 **$0.084457547**이다.
- Qwen/Terra/Sol 시간 초과·Sol 클라이언트 준비 실패·Google402는 비용 정산이 불명확해 **$0.4084443** 최대 예약을 보존했다. 공개 OpenRouter 오류 요금 정책으로 클라이언트 시간 초과를 무료 처리하지 않았다. 모든 불명 비용을 합한 보수적 계상은 **$0.492901847 / $0.50**이다. 실제 청구액이$0.49라는 뜻이 아니며 남은 예약 여유가 작아 추가 유료 호출은 종료했다.

연구 runner·참조 세 버전·최종 결과 JSON·이전/정정 채점 결과는 Git 제외 로컬 `.superpowers/sdd/2026-11-12-sul-44-schedule-image-import/`에 보존했다. 원본 bytes·키·추론 내용은 이 결과 파일에 저장하지 않았다. 최종 구조화 응답은 원문 대조를 위한 로컬 연구 자료이며 앱 서버의 일반 로그·D1에는 남기지 않았다. 이 Markdown은 비밀키나 전체 모델 응답을 포함하지 않는다.

## 8. 채택 시 필요한 작업과 남은 검증

현재 앱은 Luna none을 그대로 사용한다. 다음 모델 변경은 Flash-Lite minimal을 단일 기본 모델로 연결하면서 reader·정확한 모델 ID·클라이언트 표시·실제 외부 전송/보관 안내·키·토큰/추론량·단가·최대 비용 예약·실사용 정산을 함께 바꾸는 범위다. Gemini direct를 선택하면 이번 `low` 실험에서 확인한 계정402도 먼저 해소해야 한다. 유효한 minimal 실측은 Google AI Studio에 고정한 OpenRouter 경로에서 얻었다. 이 보고서는 두 전송 경로의 같은 품질/가용성을 보장하지 않는다.

남은 D7은 실제30장(멤버12·통합12·어려운6), 멤버까지 포함한 핵심 항목 동시95%, 업로드 후 편집 가능까지5/10초·95%가20초 내, 실제 사용자 작업시간50% 단축, 명시적으로 확인한 저장과 재조회100% 일치다. 이번4장·모델 응답 시간·멤버 미채점 결과로 대체하지 않는다. 특히 휴방2건의 요일 연결과18:00 보정·기준 주 일괄 확인을 정상 앱에서 검증해야 한다. 비교용 API 호출은 후보 선정의 보조 근거이며 로그인→업로드→원본 대조→편집→선택 적용→새 일정표/D1 확인 흐름의 완료 증거가 아니다.


## 제외·보류한 범위

- GPT-6 Astra·Claude Sonnet/Opus·Gemini4 등의 더 큰 모델은 첫 비교에서 제외한다. 현재보다 비싼 모델을 모두 병렬 호출해야 할 근거가 없으며, Sol까지의 품질 기준도 먼저 확인할 수 있다. [각사 목록](https://developers.openai.com/api/docs/models), [Claude 목록](https://platform.claude.com/docs/en/models/overview), [Gemini 목록](https://aistudio.google.com/docs/models)
- Gemini2.5 Flash 같은 구형 이름은 신규 도입 후보에서 제외한다. 공식 문서가 2026-12-01 자동 라우팅과 새 요금을 안내하므로 오래된 가격/모델 ID로 비교하지 않는다. [공식 이전 안내](https://aistudio.google.com/docs/pricing#gemini-2.5-flash)
- Qwen 구형 VL을 최신 대표로 대체하지 않는다. open-weight 별도1종은 위의 제한된 비교 목적일 때만 사용한다. Qwen3.7 Flash는 더 싼 목록이 있지만 OpenRouter 카탈로그에 `structured_outputs`가 표시되지 않아 첫 strict-schema 비교에서는 Qwen3.8을 우선한다. [Qwen 선택 안내](https://www.alibabacloud.com/help/en/model-studio/text-generation-model), [현재 목록](https://openrouter.ai/api/v1/models)
- OCR 전용 제품, 자체 GPU, OCR→두 번째 LLM 조합, 자동 crop/재호출, Batch/Flex/무료 라우터, 폐쇄형 choice API는 이번 단일 호출 초안의 첫 비교에서 제외한다. 새로운 운영 경로·대기·전처리 또는 출력 제약을 추가하기 때문이다. 현재 후보가 모두 실패하면 원인과 필요 범위를 보고 별도로 판단한다.

## 조사 검증과 남은 한계

공식 문서·공개 모델/공급자 API·인증 접근을 확인하고 원본4장 비교와 재채점을 완료했다. 가격·최대 예약의 계산 assertion, 문자열 거리/행 연결/시간 채점 self-check와 원본 해시·마크다운 참조·문서 diff를 확인했다. 제품 코드·로컬/운영 DB·키 파일·배포·Git 게시는 변경하지 않았다. 이번 추적 변경은 연구 문서와 현재 작업 상태뿐이므로 제품 전체 테스트/릴리스 preflight는 다시 실행하지 않았다.

모든 공개 모델·동일 설정의 반복 실행·30장 D7을 평가한 결과가 아니다. 사용자 확정 정답·멤버 귀속·실제 편집/적용 시간·보존 계정 설정·청구서 정산은 남았다. 요금/목록은 조회 시점 스냅샷이고 Gemini3.8 예정 인상·공급자/지역 차이·크레딧 수수료를 반영해야 한다. 60회/$0.50의 불명 비용 보존 원칙 때문에 추가 유료 실험은 종료했다. 후보 채택과 정상 앱 검증은 별도 구현 작업으로 남긴다.
