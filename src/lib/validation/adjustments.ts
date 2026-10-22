import { z } from 'zod';
import { descripcionSchema, fechaSchema, montoSchema } from '$lib/validation/common';

// Mismo conjunto que el enum bucket_kind de la BD: un bolsillo que no exista se
// quedaría sin poder grabarse en la columna.
const bolsillo = z.enum(['short_term', 'medium_term', 'long_term'], 'Elige un bolsillo válido');

const modo = z.enum(['manual', 'difference'], 'Elige cómo hacer el ajuste');

/**
 * FormData manda strings, y `Number("")` es 0. Para una cantidad que sí puede ser
 * 0 eso es peligroso: un campo en blanco se colaría como "conté cero" en vez de
 * fallar. Este envoltorio convierte el vacío en ausente antes de coercionar.
 */
const vacioAAusente = (value: unknown) =>
	typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Lo que el usuario cuenta tener. A diferencia de `montoSchema` este admite 0:
 * "conté y no tengo nada" es un dato legítimo, y es justamente el caso que produce
 * el mayor ajuste a favor. Lo que no puede ser es negativo ni llevar decimales
 * sueltos, porque se compara contra el saldo para sacar la diferencia.
 */
const contadoSchema = z.preprocess(
	vacioAAusente,
	z.coerce
		.number('Escribe un monto válido')
		.min(0, 'No puedes contar una cantidad negativa')
		.max(999_999_999_999.99, 'El monto es demasiado grande')
		.multipleOf(0.01, 'Máximo 2 decimales')
);

// `manual` resta un gasto directo; `difference` compara lo contado con el saldo
// y el servidor calcula el delta. Solo se manda el campo del modo elegido.
export const adjustmentSchema = z
	.object({
		bucket: bolsillo,
		mode: modo,
		amount: z.optional(montoSchema),
		countedAmount: z.optional(contadoSchema),
		date: fechaSchema,
		description: descripcionSchema
	})
	.superRefine((data, ctx) => {
		if (data.mode === 'manual') {
			if (data.amount === undefined) {
				ctx.addIssue({
					code: 'custom',
					message: 'Escribe un monto válido',
					path: ['amount']
				});
			}
			return;
		}

		if (data.countedAmount === undefined) {
			ctx.addIssue({
				code: 'custom',
				message: 'Escribe cuánta plata tienes',
				path: ['countedAmount']
			});
		}
	});

export type AdjustmentData = z.infer<typeof adjustmentSchema>;