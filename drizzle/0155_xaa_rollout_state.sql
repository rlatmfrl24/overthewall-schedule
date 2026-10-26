INSERT INTO x_activity_coordinator(id,ready,webhook_id,bootstrap_extra_day,bootstrap_extra_micros,updated_at)
SELECT 1,0,(SELECT webhook_id FROM x_activity_state WHERE id=1),'2026-10-26',15000,0;
--> statement-breakpoint
INSERT INTO x_activity_sites(site,enabled,pause_reason,updated_at)
VALUES('otw',0,'user',0),('luvdia',0,'user',0);
--> statement-breakpoint
INSERT INTO x_activity_subscriptions(user_id,tag,subscription_id,webhook_id,expires_at,status,last_error,updated_at)
SELECT user_id,tag,subscription_id,webhook_id,expires_at,status,last_error,updated_at
FROM x_activity_state WHERE id=1;
