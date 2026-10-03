import { z } from 'zod';

export const incomeSchema = z.object({
	// FormData siempre manda strings; coerce los convierte a número.
	// Un campo vacío llega como "" y Number("") es 0, así que cae en `positive`.
	amount: z.coerce
		.number('Escribe un monto válido')
		.positive('El monto debe ser mayor que 0')
		.max(999_999_999_999.99, 'El monto es demasiado grande')
		.multipleOf(0.01, 'Máximo 2 decimales'),
	// Formato YYYY-MM-DD, el que manda <input type="date">.
	date: z.iso.date('Fecha no válida'),
	description: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
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
