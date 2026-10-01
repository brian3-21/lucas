import type { BucketKind } from '$lib/server/db/schema';

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// Reparte un ingreso entre los tres bolsillos. El largo plazo absorbe el
// resto del redondeo para que los tres sumen siempre exactamente `amount`.
export function splitAmount(
	amount: number,
	pcts: { short: number; medium: number }
): Record<BucketKind, number> {
	const short = round2((amount * pcts.short) / 100);
	const medium = round2((amount * pcts.medium) / 100);
	const long = round2(amount - short - medium);
	return { short_term: short, medium_term: medium, long_term: long };
}
