UPDATE x_posts
SET first_seen_at = fetched_at
WHERE first_seen_at = 0;--> statement-breakpoint
UPDATE naver_cafe_posts
SET first_seen_at = fetched_at
WHERE first_seen_at = 0;
