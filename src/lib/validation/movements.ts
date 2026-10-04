import { z } from 'zod';
import { descripcionSchema, fechaSchema, montoSchema } from '$lib/validation/common';

export const incomeSchema = z.object({
	amount: montoSchema,
	date: fechaSchema,
	description: descripcionSchema,
	categoryId: z.uuid('Categoría no válida').optional()
});

export type IncomeData = z.infer<typeof incomeSchema>;

// El id llega de un <input type="hidden"> controlado por el cliente, así que se
// valida como cualquier otro dato: si no es un uuid, la consulta no llega a ejecutarse.
export const movementIdSchema = z.uuid('Movimiento no válido');

// Editar y dar de alta piden exactamente los mismos campos; lo único que cambia es
// que la edición necesita saber a qué movimiento pertenece lo que se envía.
export const movementUpdateSchema = incomeSchema.extend({ id: movementIdSchema });

export type MovementUpdateData = z.infer<typeof movementUpdateSchema>;
