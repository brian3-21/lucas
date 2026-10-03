<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { DATABASE_UNAVAILABLE_CODE } from '$lib/database-unavailable';

	const status = $derived(page.status);
	const mensaje = $derived(page.error?.message);

	/**
	 * Un 503 con este `code` significa que Postgres no responde: hay una pista
	 * concreta en el mensaje y "volver al resumen" solo volvería a fallar, así que
	 * lo útil es recargar cuando la BD ya esté de vuelta.
	 *
	 * Recuerda que el mismo fallo lanzado en `handle` lo sirve `src/error.html`,
	 * no esta página.
	 */
	const baseDeDatosCaida = $derived(page.error?.code === DATABASE_UNAVAILABLE_CODE);

	function reintentar() {
		location.reload();
	}
</script>

<svelte:head>
	<title>{status} · Lucas</title>
</svelte:head>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 p-4 text-center">
	<p class="tabular text-6xl font-semibold tracking-tight text-muted-foreground">{status}</p>

	<div class="max-w-sm space-y-2">
		<h1 class="text-lg font-medium">
			{baseDeDatosCaida
				? 'La base de datos no está disponible'
				: status === 404
					? 'Esta página no existe :('
					: 'Algo ha ido mal'}
		</h1>
		{#if mensaje}
			<p class="text-sm text-muted-foreground">{mensaje}</p>
		{/if}
	</div>

	{#if baseDeDatosCaida}
		<Button variant="outline" onclick={reintentar}>Reintentar</Button>
	{:else}
		<Button href="/" variant="outline">Volver al resumen</Button>
	{/if}
</div>
