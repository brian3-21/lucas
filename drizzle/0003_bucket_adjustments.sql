CREATE TYPE "public"."adjustment_mode" AS ENUM('manual', 'difference');--> statement-breakpoint
CREATE TABLE "bucket_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bucket" "bucket_kind" NOT NULL,
	"currency" "currency_code" DEFAULT 'CUP' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"mode" "adjustment_mode" NOT NULL,
	"counted_amount" numeric(14, 2),
	"previous_balance" numeric(14, 2),
	"description" text,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bucket_adjustments_amount_nonzero" CHECK ("bucket_adjustments"."amount" <> 0),
	CONSTRAINT "bucket_adjustments_manual_is_negative" CHECK ("bucket_adjustments"."mode" <> 'manual' OR "bucket_adjustments"."amount" < 0),
	CONSTRAINT "bucket_adjustments_difference_keeps_evidence" CHECK ("bucket_adjustments"."mode" <> 'difference' OR ("bucket_adjustments"."counted_amount" IS NOT NULL AND "bucket_adjustments"."previous_balance" IS NOT NULL))
);
--> statement-breakpoint
-- Los dos CHECK antiguos salen antes de tocar nada: `single_origin` solo conocía
-- dos orígenes y `income_amount_positive` prohibía el signo negativo que ahora
-- necesita un ajuste de gasto.
ALTER TABLE "bucket_allocations" DROP CONSTRAINT "bucket_allocations_single_origin";--> statement-breakpoint
ALTER TABLE "bucket_allocations" DROP CONSTRAINT "bucket_allocations_income_amount_positive";--> statement-breakpoint
ALTER TABLE "bucket_allocations" ADD COLUMN "adjustment_id" uuid;--> statement-breakpoint
ALTER TABLE "bucket_allocations" ADD CONSTRAINT "bucket_allocations_adjustment_id_bucket_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."bucket_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bucket_adjustments" ADD CONSTRAINT "bucket_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bucket_allocations" ADD CONSTRAINT "bucket_allocations_single_origin" CHECK (num_nonnulls("bucket_allocations"."movement_id", "bucket_allocations"."transfer_id", "bucket_allocations"."adjustment_id") = 1);--> statement-breakpoint
ALTER TABLE "bucket_allocations" ADD CONSTRAINT "bucket_allocations_origin_sign" CHECK ("bucket_allocations"."transfer_id" IS NOT NULL OR "bucket_allocations"."adjustment_id" IS NOT NULL OR "bucket_allocations"."amount" > 0);--> statement-breakpoint
CREATE INDEX "bucket_adjustments_user_id_idx" ON "bucket_adjustments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bucket_adjustments_date_idx" ON "bucket_adjustments" USING btree ("date");--> statement-breakpoint
CREATE INDEX "bucket_allocations_adjustment_id_idx" ON "bucket_allocations" USING btree ("adjustment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bucket_allocations_adjustment_bucket_idx" ON "bucket_allocations" USING btree ("adjustment_id","bucket");