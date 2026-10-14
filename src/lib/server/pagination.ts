export const PAGE_SIZE = 10;

export function getOffset(url: URL): number {
	const raw = Number(url.searchParams.get('offset') ?? '0');
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}
