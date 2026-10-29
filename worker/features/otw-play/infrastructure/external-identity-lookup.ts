import { normalizeOtwPlaySearchText } from "../domain/search-normalization";

export async function lookupExternalIdentity(database: D1Database, displayName: string, excludeId = "") {
  const normalized = normalizeOtwPlaySearchText(displayName);
  const { results } = await database.prepare(`
    WITH candidates AS (
      SELECT id FROM music_entities WHERE normalized_name = ?
      UNION SELECT entity_id FROM music_entity_aliases WHERE normalized_alias = ?
    )
    SELECT entity.id, entity.display_name AS displayName, entity.archived_at AS archivedAt
    FROM candidates JOIN music_entities entity ON entity.id = candidates.id
    WHERE entity.member_uid IS NULL AND entity.id <> ?
    ORDER BY entity.id LIMIT 2
  `).bind(normalized, normalized, excludeId).all<{ id: string; displayName: string; archivedAt: number | null }>();
  const entity = results[0] ?? null;
  const error = results.length > 1 ? "같은 이름·별칭의 가수가 여러 개 있습니다. 기존 가수 정보를 확인해 주세요."
    : entity?.archivedAt != null ? "이 이름의 가수는 보관되어 있습니다. 기존 보관 상태를 확인해 주세요." : null;
  return { entity: error ? null : entity, error };
}
