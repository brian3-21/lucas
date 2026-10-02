-- Redondeo de los porcentajes de reparto: 60/25/15 -> 60/30/10.
--
-- El orden importa. Este archivo entero corre en una sola transacción (Postgres
-- es transaccional), así que los dos backfills van primero: si los CHECK de
-- abajo se crearan antes, ADD CONSTRAINT fallaría contra el 25 y el 15 viejos.
--
-- Los UPDATE se acotan al triple exacto 60/25/15 a propósito. No normalizamos
-- "cualquier múltiplo de 5": si una fila no encaja en ese patrón, el
-- ADD CONSTRAINT de abajo revienta la migración y hay que mirarla a mano, en
-- vez de que este script adivine un reparto que el usuario nunca pidió.

-- 1. Rehacer el libro mayor con 60/30/10. Va antes de tocar users para poder
--    filtrar por el reparto viejo. El ELSE replica el residuo de splitAmount()
--    (src/lib/buckets.ts) para que los tres bolsillos sumen el ingreso exacto.
UPDATE bucket_allocations a
SET amount = CASE a.bucket
        WHEN 'short_term' THEN round(m.amount * 0.60, 2)
        WHEN 'medium_term' THEN round(m.amount * 0.30, 2)
        ELSE m.amount - round(m.amount * 0.60, 2) - round(m.amount * 0.30, 2)
    END
FROM movements m
WHERE m.id = a.movement_id
  AND m.type = 'income'
  AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = a.user_id
          AND u.split_short = 60 AND u.split_medium = 25 AND u.split_long = 15
    );--> statement-breakpoint

-- 2. Backfill de los usuarios que tenían el reparto default viejo.
UPDATE users SET split_medium = 30, split_long = 10
WHERE split_short = 60 AND split_medium = 25 AND split_long = 15;--> statement-breakpoint

-- 3. Defaults nuevos para los usuarios que se registren de aquí en adelante.
ALTER TABLE "users" ALTER COLUMN "split_medium" SET DEFAULT '30';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "split_long" SET DEFAULT '10';--> statement-breakpoint

-- 4. Barrera en la BD: la última línea de defensa si algo se cuela sin pasar
--    por la validación de zod.
ALTER TABLE "users" ADD CONSTRAINT "users_split_multiples_of_10" CHECK ("users"."split_short" % 10 = 0 AND "users"."split_medium" % 10 = 0 AND "users"."split_long" % 10 = 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_split_sums_to_100" CHECK ("users"."split_short" + "users"."split_medium" + "users"."split_long" = 100);