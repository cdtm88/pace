DROP TABLE "strava_connections";--> statement-breakpoint
CREATE TABLE "activity_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"duration_sec" integer NOT NULL,
	"avg_power_w" integer,
	"estimated_tss" integer,
	"matched_session_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_uploads" ADD CONSTRAINT "activity_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_uploads" ADD CONSTRAINT "activity_uploads_matched_session_id_training_sessions_id_fk" FOREIGN KEY ("matched_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_uploads_user_id_idx" ON "activity_uploads" USING btree ("user_id");
