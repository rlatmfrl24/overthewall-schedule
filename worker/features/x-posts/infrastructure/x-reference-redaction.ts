type DB = Pick<D1Database, "prepare">;

// Include these statements in the same D1 transaction as the original tombstone.
// Match embedded IDs too: legacy posts may not have their reference rows yet.
export function prepareXReferenceRedaction(
  db: DB,
  ids: string[],
  timestamp: number,
) {
  const targets = JSON.stringify(ids);
  const statements = ["reply", "quote"].map((relation) =>
    db
      .prepare(
        `UPDATE x_posts SET value=json_set(value,'$.${relation}.post',NULL)
     WHERE json_valid(value) AND json_extract(value,'$.${relation}.post.id')
       IN (SELECT value FROM json_each(?))`,
      )
      .bind(targets),
  );
  statements.push(
    db
      .prepare(
        `UPDATE x_posts SET value=json_set(value,'$.links',json((
         SELECT json_group_array(json(CASE WHEN json_extract(link.value,'$.linkedPost.id')
           IN (SELECT value FROM json_each(?))
         THEN json_remove(link.value,'$.linkedPost','$.title','$.description','$.imageUrl','$.siteName','$.previewStatus')
         ELSE link.value END)) FROM json_each(x_posts.value,'$.links') link)))
       WHERE json_valid(value) AND EXISTS (
         SELECT 1 FROM json_each(x_posts.value,'$.links') link
         WHERE json_extract(link.value,'$.linkedPost.id') IN (SELECT value FROM json_each(?)))`,
      )
      .bind(targets, targets),
    db
      .prepare(
        `UPDATE x_post_references SET resolution_state='terminal',hydrated_at=NULL,
       next_attempt_at=NULL,last_error_code='not_found_or_unavailable',
       author_state='terminal',author_next_attempt_at=NULL,author_last_error_code=NULL,
       lease_token=NULL,lease_until=NULL,updated_at=?
       WHERE referenced_post_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(timestamp, targets),
    db
      .prepare(
        `DELETE FROM x_api_cache WHERE type='posts' OR
       (type='linked_post' AND key IN (SELECT 'x:linked-post:v1:'||value FROM json_each(?)))`,
      )
      .bind(targets),
  );
  return statements;
}
