import { splitAmount } from '$lib/buckets';

export function filasReparto(
	userId: string,
	movementId: string,
	amount: number,
	pcts: { short: number; medium: number }
) {
	const reparto = splitAmount(amount, pcts);
	return [
		{ userId, movementId, bucket: 'short_term' as const, amount: reparto.short_term.toFixed(2) },
		{ userId, movementId, bucket: 'medium_term' as const, amount: reparto.medium_term.toFixed(2) },
		{ userId, movementId, bucket: 'long_term' as const, amount: reparto.long_term.toFixed(2) }
	];
}
