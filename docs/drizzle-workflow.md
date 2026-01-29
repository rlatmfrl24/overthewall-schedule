# Drizzle-kit + D1 마이그레이션 워크플로우

## 기본 원칙

- `drizzle/`에 수동으로 파일을 만들지 않는다
- 데이터 변환이 필요하면 `--custom`으로 빈 마이그레이션을 만든 뒤 편집한다
- 이미 적용된 마이그레이션 파일은 수정하지 않는다
- 항상 새 번호(연속 번호)로 생성한다

## 표준 흐름

1. 스키마 수정: `src/db/schema.ts`
2. 마이그레이션 생성:
   - 일반 변경: `pnpm drizzle:generate`
   - 데이터 변환 필요: `pnpm drizzle:generate:custom`
3. 생성된 SQL 검토:
   - 예상치 못한 `DROP TABLE`/`RENAME`이 있으면 스키마를 다시 확인한다
4. D1 반영(원격):
   - `pnpm drizzle:migrate:remote`
5. 변경 파일 커밋:
   - `drizzle/*.sql`, `drizzle/meta/*`, `src/db/schema.ts`

## 흔한 문제와 예방

- **SQL이 이상하게 생성됨**
  - `drizzle/`에 수동으로 만든 파일 때문에 `meta/_journal.json`과 불일치가 생길 수 있다
  - 해결: `pnpm drizzle:generate:custom`으로 새 번호의 마이그레이션을 만든 뒤 편집
- **D1 반영이 안 됨**
  - `wrangler d1 migrations apply`가 아닌 다른 명령을 쓰면 반영 대상이 바뀔 수 있다
  - 해결: 원격 반영은 항상 `pnpm drizzle:migrate:remote`

## 체크리스트

- [ ] 새 마이그레이션 번호가 중복되지 않는다
- [ ] `drizzle/meta/_journal.json`이 함께 업데이트됐다
- [ ] D1 원격에 적용했다 (`pnpm drizzle:migrate:remote`)
