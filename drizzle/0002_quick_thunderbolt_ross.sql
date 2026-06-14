ALTER TABLE "training_sessions" ADD COLUMN "title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "readiness_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "blocks" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "total_duration_sec" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "raw_json" text;