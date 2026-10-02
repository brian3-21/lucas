import { z } from 'zod';

const porcentaje = z.coerce
	.number('Escribe un porcentaje válido')
	.multipleOf(10, 'El porcentaje debe ser múltiplo de 10')
	.min(0, 'El porcentaje no puede ser negativo')
	.max(100, 'El porcentaje no puede pasar de 100');

// Espeja los dos CHECK de la tabla users. El banco es la última línea de
// defensa; esto solo da el mensaje de error antes de llegar ahí.
export const splitSchema = z
	.object({
		splitShort: porcentaje,
		splitMedium: porcentaje,
		splitLong: porcentaje
	})
	.refine((data) => data.splitShort + data.splitMedium + data.splitLong === 100, {
		message: 'Los tres porcentajes deben sumar 100',
		path: ['splitLong']
	});

export type SplitData = z.infer<typeof splitSchema>;