import { z } from 'zod';
import { descripcionSchema, fechaSchema, montoSchema } from '$lib/validation/common';

// Mismo conjunto que el enum bucket_kind de la BD: un bolsillo que no exista se
// quedaría sin poder grabarse en la columna.
const bolsillo = z.enum(['short_term', 'medium_term', 'long_term'], 'Elige un bolsillo válido');

// Mover dinero entre bolsillos no cambia el total, solo su reparto. Por eso el
// destino es obligatorio y además tiene que ser distinto del origen: no hay
// forma de escribir un traslado sin destino y así dejar el dinero "en el aire".
export const transferSchema = z
	.object({
		from: bolsillo,
		to: bolsillo,
		amount: montoSchema,
		date: fechaSchema,
		description: descripcionSchema
	})
	.refine((data) => data.from !== data.to, {
		message: 'El destino tiene que ser otro bolsillo',
		path: ['to']
	});

export type TransferData = z.infer<typeof transferSchema>;
