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

/**
 * Un ajuste quita dinero de un bolsillo, y hay dos maneras de decirlo:
 *
 * - `manual`: un gasto directo, "saqué 500". El monto siempre sale hacia fuera,
 *   nunca hacia dentro; para sumar está la otra forma.
 * - `difference`: el usuario contó cuánta plata tiene y el servidor calcula la
 *   resta contra el saldo real del momento. Esa diferencia puede salir positiva
 *   (contó más de lo que el sistema tenía anotado) o negativa.
 *
 * `amount` y `countedAmount` son opcionales en el esquema base y obligatorios
 * según el modo: son campos distintos según la forma elegida, y el que no aplica
 * ni se manda. El delta nunca viene del cliente, porque depende de las filas que
 * ya hay en el libro mayor; lo calcula el servidor con el saldo real.
 */
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