<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';

	const status = $derived(page.status);
	const mensaje = $derived(page.error?.message);
</script>

<svelte:head>
	<title>{status} · Lucas</title>
</svelte:head>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 p-4 text-center">
	<p class="tabular text-6xl font-semibold tracking-tight text-muted-foreground">{status}</p>

	<div class="max-w-sm space-y-2">
		<h1 class="text-lg font-medium">
			{status === 404 ? 'Esta página no existe :(' : 'Algo ha ido mal'}
		</h1>
		{#if mensaje}
			<p class="text-sm text-muted-foreground">{mensaje}</p>
		{/if}
	</div>

	<Button href="/" variant="outline">Volver al resumen</Button>
</div>
