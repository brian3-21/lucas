CREATE TYPE "public"."currency_code" AS ENUM('CUP', 'USD');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "base_currency" SET DEFAULT 'CUP';--> statement-breakpoint
ALTER TABLE "bucket_allocations" ADD COLUMN "currency" "currency_code" DEFAULT 'CUP' NOT NULL;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "currency" "currency_code" DEFAULT 'CUP' NOT NULL;