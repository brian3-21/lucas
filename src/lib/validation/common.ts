import { z } from 'zod';

/**
 * Reglas que comparten ingresos y transferencias entre bolsillos. Están aquí y no
 * en movements.ts para que un monto se valide siempre igual: si las dos copias se
 * separan, un día se permitirá aquí lo que allí se rechaza.
 */
export const montoSchema = z.coerce
	.number('Escribe un monto válido')
	// FormData siempre manda strings y un campo vacío llega como ""; Number("") es
	// 0, así que un monto en blanco cae aquí en vez de colarse como cero.
	.positive('El monto debe ser mayor que 0')
	.max(999_999_999_999.99, 'El monto es demasiado grande')
	.multipleOf(0.01, 'Máximo 2 decimales');

/** Formato YYYY-MM-DD, el que manda <input type="date">. */
export const fechaSchema = z.iso.date('Fecha no válida');

export const descripcionSchema = z.string().trim().max(200, 'Máximo 200 caracteres').optional();
