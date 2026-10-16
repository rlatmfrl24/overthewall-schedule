-- Keep repair progress outside captured business rows and preserve every source fence.
CREATE TRIGGER x_post_repair_insert AFTER INSERT ON x_posts BEGIN
 INSERT INTO x_post_repair_work(post_id,facts_pending,references_pending)
 VALUES(NEW.id,NEW.hidden_at IS NULL AND NEW.content_removed_at IS NULL,NEW.hidden_at IS NULL AND NEW.content_removed_at IS NULL);
 DELETE FROM x_quote_body_work WHERE source_post_id=NEW.id AND NOT EXISTS(SELECT 1 FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=NEW.id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END);
 INSERT INTO x_quote_body_work(source_post_id,due_at,created_at)
 SELECT r.source_post_id,COALESCE(r.next_attempt_at,0),r.created_at FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=NEW.id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END
 ON CONFLICT(source_post_id) DO UPDATE SET due_at=excluded.due_at,created_at=excluded.created_at
 WHERE x_quote_body_work.due_at IS NOT excluded.due_at OR x_quote_body_work.created_at IS NOT excluded.created_at; END;
--> statement-breakpoint
CREATE TRIGGER x_post_repair_update AFTER UPDATE OF value,handle,hidden_at,content_removed_at ON x_posts
 WHEN OLD.value IS NOT NEW.value OR OLD.handle IS NOT NEW.handle OR OLD.hidden_at IS NOT NEW.hidden_at OR OLD.content_removed_at IS NOT NEW.content_removed_at
 BEGIN
 INSERT INTO x_post_repair_work(post_id,facts_pending,references_pending)
 VALUES(NEW.id,NEW.hidden_at IS NULL AND NEW.content_removed_at IS NULL,NEW.hidden_at IS NULL AND NEW.content_removed_at IS NULL)
 ON CONFLICT(post_id) DO UPDATE SET facts_pending=excluded.facts_pending,references_pending=excluded.references_pending,
 generation=x_post_repair_work.generation+1,checked_at=0;
 DELETE FROM x_quote_body_work WHERE source_post_id=NEW.id AND NOT EXISTS(SELECT 1 FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=NEW.id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END);
 INSERT INTO x_quote_body_work(source_post_id,due_at,created_at)
 SELECT r.source_post_id,COALESCE(r.next_attempt_at,0),r.created_at FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=NEW.id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END
 ON CONFLICT(source_post_id) DO UPDATE SET due_at=excluded.due_at,created_at=excluded.created_at
 WHERE x_quote_body_work.due_at IS NOT excluded.due_at OR x_quote_body_work.created_at IS NOT excluded.created_at; END;
--> statement-breakpoint
CREATE TRIGGER x_quote_body_insert AFTER INSERT ON x_post_references BEGIN DELETE FROM x_quote_body_work WHERE source_post_id=NEW.source_post_id AND NOT EXISTS(SELECT 1 FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=NEW.source_post_id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END);
 INSERT INTO x_quote_body_work(source_post_id,due_at,created_at)
 SELECT r.source_post_id,COALESCE(r.next_attempt_at,0),r.created_at FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=NEW.source_post_id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END
 ON CONFLICT(source_post_id) DO UPDATE SET due_at=excluded.due_at,created_at=excluded.created_at
 WHERE x_quote_body_work.due_at IS NOT excluded.due_at OR x_quote_body_work.created_at IS NOT excluded.created_at; END;
--> statement-breakpoint
CREATE TRIGGER x_quote_body_update AFTER UPDATE OF source_post_id,relation_type,referenced_post_id,resolution_state,hydrated_at,next_attempt_at ON x_post_references
 BEGIN DELETE FROM x_quote_body_work WHERE source_post_id=OLD.source_post_id AND OLD.relation_type='quote' AND OLD.source_post_id IS NOT NEW.source_post_id;
 DELETE FROM x_quote_body_work WHERE source_post_id=NEW.source_post_id AND NOT EXISTS(SELECT 1 FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=NEW.source_post_id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END);
 INSERT INTO x_quote_body_work(source_post_id,due_at,created_at)
 SELECT r.source_post_id,COALESCE(r.next_attempt_at,0),r.created_at FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=NEW.source_post_id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END
 ON CONFLICT(source_post_id) DO UPDATE SET due_at=excluded.due_at,created_at=excluded.created_at
 WHERE x_quote_body_work.due_at IS NOT excluded.due_at OR x_quote_body_work.created_at IS NOT excluded.created_at; END;
--> statement-breakpoint
CREATE TRIGGER x_fact_repair_delete AFTER DELETE ON x_post_facts BEGIN INSERT INTO x_post_repair_work(post_id,facts_pending,references_pending)
 SELECT id,1,0 FROM x_posts WHERE id=OLD.post_id AND hidden_at IS NULL AND content_removed_at IS NULL
 ON CONFLICT(post_id) DO UPDATE SET facts_pending=1,generation=x_post_repair_work.generation+1,checked_at=0; END;
--> statement-breakpoint
CREATE TRIGGER x_reference_repair_delete AFTER DELETE ON x_post_references BEGIN
 INSERT INTO x_post_repair_work(post_id,facts_pending,references_pending)
 SELECT id,0,1 FROM x_posts WHERE id=OLD.source_post_id AND hidden_at IS NULL AND content_removed_at IS NULL
 ON CONFLICT(post_id) DO UPDATE SET references_pending=1,generation=x_post_repair_work.generation+1,checked_at=0; DELETE FROM x_quote_body_work WHERE source_post_id=OLD.source_post_id AND NOT EXISTS(SELECT 1 FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=OLD.source_post_id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END);
 INSERT INTO x_quote_body_work(source_post_id,due_at,created_at)
 SELECT r.source_post_id,COALESCE(r.next_attempt_at,0),r.created_at FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.source_post_id=OLD.source_post_id AND r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END
 ON CONFLICT(source_post_id) DO UPDATE SET due_at=excluded.due_at,created_at=excluded.created_at
 WHERE x_quote_body_work.due_at IS NOT excluded.due_at OR x_quote_body_work.created_at IS NOT excluded.created_at; END;
--> statement-breakpoint
-- Seed only incomplete legacy work; completed history must not become a new write-heavy backfill.
INSERT INTO x_post_repair_work(post_id,facts_pending,references_pending)
 SELECT id,facts_pending,references_pending FROM (
   SELECT p.id,f.post_id IS NULL AS facts_pending,
     CASE WHEN json_valid(p.value) THEN
       (json_extract(p.value,'$.quote.postId') IS NOT NULL AND NOT EXISTS(
         SELECT 1 FROM x_post_references r WHERE r.source_post_id=p.id AND r.relation_type='quote'
           AND r.referenced_post_id=json_extract(p.value,'$.quote.postId')))
       OR (json_extract(p.value,'$.reply.postId') IS NOT NULL AND NOT EXISTS(
         SELECT 1 FROM x_post_references r WHERE r.source_post_id=p.id AND r.relation_type='reply'
           AND r.referenced_post_id=json_extract(p.value,'$.reply.postId')))
       ELSE 0 END AS references_pending
   FROM x_posts p LEFT JOIN x_post_facts f ON f.post_id=p.id
   WHERE p.hidden_at IS NULL AND p.content_removed_at IS NULL
 ) WHERE facts_pending OR references_pending;
--> statement-breakpoint
INSERT INTO x_quote_body_work(source_post_id,due_at,created_at)
 SELECT r.source_post_id,COALESCE(r.next_attempt_at,0),r.created_at FROM x_post_references r JOIN x_posts p ON p.id=r.source_post_id
 WHERE r.relation_type='quote'
 AND r.resolution_state IN ('pending','local','link_only','hydrated')
 AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
 AND CASE WHEN json_valid(p.value) THEN r.hydrated_at IS NULL
   OR COALESCE(json_extract(p.value,'$.quote.post.id'),'')<>r.referenced_post_id ELSE 0 END;
