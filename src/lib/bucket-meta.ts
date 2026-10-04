import type { BucketKind } from '$lib/server/db/schema';

// `import type` no llega al bundle del cliente, así que este módulo se puede usar
// desde los componentes aunque el enum viva en un archivo de servidor.
export type { BucketKind };

// Datos de presentación de los bolsillos. Viven aquí, y no en el enum de la BD
// ni en $lib/server, porque los componentes del cliente los necesitan igual.

// El orden en el que se pintan las tarjetas y los <select> de una transferencia.
// El enum no fija ningún orden, así que este es el único sitio donde se decide
// el de la interfaz.
export const BUCKET_ORDER = [
	'short_term',
	'medium_term',
	'long_term'
] as const satisfies readonly BucketKind[];

export const BUCKET_LABELS: Record<BucketKind, string> = {
	short_term: 'Corto plazo',
	medium_term: 'Mediano plazo',
	long_term: 'Largo plazo'
};
