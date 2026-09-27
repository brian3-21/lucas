import { z } from 'zod';

/** Errores por campo, listos para pintar junto a cada input. */
export type FieldErrors = Record<string, string[] | undefined>;

/**
 * Convierte un error de zod en `{ campo: [mensajes] }`.
 *
 * En zod 4 esto es `z.flattenError`. Antes se llamaba `error.flatten()`.
 */
export function fieldErrors(error: z.ZodError): FieldErrors {
	return z.flattenError(error).fieldErrors as FieldErrors;
}

/** Lee un FormData a objeto plano, quedándose solo con las claves permitidas. */
export function pick(
	formData: FormData,
	keys: readonly string[]
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of keys) {
		const value = formData.get(key);
		if (typeof value === 'string') out[key] = value;
	}
	return out;
}
