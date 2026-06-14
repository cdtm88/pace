ALTER TABLE "user_profiles" ADD COLUMN "ftp" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "weight" real;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "goals" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "injuries" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "onboarding_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id");