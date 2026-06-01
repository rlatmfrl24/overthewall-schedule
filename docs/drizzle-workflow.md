# Drizzle-kit + D1 마이그레이션 워크플로우

## 기본 원칙

- `drizzle/`에 수동으로 파일을 만들지 않는다
- 데이터 변환이 필요하면 `--custom`으로 빈 마이그레이션을 만든 뒤 편집한다
- 이미 적용된 마이그레이션 파일은 수정하지 않는다
- 항상 새 번호(연속 번호)로 생성한다
- 개발/테스트 기본값은 로컬 D1이며, 원격 D1은 release/deploy 단계에서만 명시적으로 사용한다

## 표준 흐름

1. 스키마 수정: `src/db/schema.ts`
2. 마이그레이션 생성:
   - 일반 변경: `pnpm drizzle:generate`
   - 데이터 변환 필요: `pnpm drizzle:generate:custom`
3. 생성된 SQL 검토:
   - 예상치 못한 `DROP TABLE`/`RENAME`이 있으면 스키마를 다시 확인한다
   - 조회 패턴에 필요한 index가 포함됐는지 확인한다
4. 로컬 D1 반영:
   - 증분 적용: `pnpm drizzle:migrate:local`
   - 클린 재현: `pnpm d1:reset:local`
   - fixture 주입: `pnpm d1:seed:local`
   - 로컬 진단: `pnpm d1:doctor`
5. 변경 파일 커밋:
   - `drizzle/*.sql`, `drizzle/meta/*`, `src/db/schema.ts`

## 원격 반영

- 원격 반영은 로컬 검증 이후 release/deploy 단계에서만 수행한다
- 원격 migration 명령은 항상 `pnpm drizzle:migrate:remote`를 사용한다
- 원격 진단은 `pnpm d1:doctor --remote` 또는 release preflight에서만 수행한다

## 흔한 문제와 예방

- **SQL이 이상하게 생성됨**
  - `drizzle/`에 수동으로 만든 파일 때문에 `meta/_journal.json`과 불일치가 생길 수 있다
  - 해결: `pnpm drizzle:generate:custom`으로 새 번호의 마이그레이션을 만든 뒤 편집
- **로컬 D1 상태가 꼬임**
  - 해결: `pnpm d1:reset:local`로 로컬 state를 지우고 migration을 다시 적용한 뒤 `pnpm d1:seed:local`
- **원격 D1을 실수로 건드림**
  - 기본 개발 명령에는 `--remote`를 넣지 않는다
  - 원격 명령은 release/deploy 문맥에서 `:remote` suffix가 있는 script만 사용한다

## 체크리스트

- [ ] 새 마이그레이션 번호가 중복되지 않는다
- [ ] `drizzle/meta/_journal.json`이 함께 업데이트됐다
- [ ] `pnpm drizzle:generate`가 Cloudflare 원격 credential 없이 동작한다
- [ ] 로컬 D1에 적용했다 (`pnpm drizzle:migrate:local` 또는 `pnpm d1:reset:local`)
- [ ] 필요한 fixture를 주입했다 (`pnpm d1:seed:local`)
- [ ] 로컬 D1 doctor를 통과했다 (`pnpm d1:doctor`)
- [ ] 원격 D1 반영은 release/deploy 단계로 남겼다 (`pnpm drizzle:migrate:remote`)
