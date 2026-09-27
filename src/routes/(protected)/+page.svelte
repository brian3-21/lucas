<script lang="ts">
	import { Card, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '$lib/components/ui/empty';
	import { ArrowRight } from '@lucide/svelte';

	const secciones = [
		{ titulo: 'Cuentas', descripcion: 'Bancos, tarjetas y efectivo', href: '/cuentas' },
		{ titulo: 'Movimientos', descripcion: 'Ingresos y gastos por categoría', href: '/movimientos' },
		{ titulo: 'Presupuestos', descripcion: 'Límites mensuales', href: '/presupuestos' }
	];
</script>

<header class="mb-6">
	<p class="text-sm text-muted-foreground">Panel</p>
	<h1 class="text-3xl font-semibold tracking-tight">Resumen</h1>
</header>

<div class="grid gap-4 sm:grid-cols-3">
	<Card>
		<CardHeader>
			<CardDescription>Patrimonio total</CardDescription>
			<CardTitle class="tabular text-3xl">—</CardTitle>
		</CardHeader>
	</Card>

	<Card>
		<CardHeader>
			<CardDescription>Ahorrado este mes</CardDescription>
			<CardTitle class="tabular text-3xl">—</CardTitle>
		</CardHeader>
	</Card>

	<Card>
		<CardHeader>
			<CardDescription>Gastado este mes</CardDescription>
			<CardTitle class="tabular text-3xl">—</CardTitle>
		</CardHeader>
	</Card>
</div>

<div class="mt-6">
	<Empty class="border border-dashed">
		<EmptyHeader>
			<EmptyTitle>Todavía no hay datos</EmptyTitle>
			<EmptyDescription>
				Estas cifras se rellenan solas en cuanto registres movimientos.
			</EmptyDescription>
		</EmptyHeader>
		<nav class="flex flex-wrap gap-2">
			{#each secciones as seccion (seccion.titulo)}
				<a
					href={seccion.href}
					class="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent"
				>
					<span class="font-medium">{seccion.titulo}</span>
					<span class="text-muted-foreground">{seccion.descripcion}</span>
					<ArrowRight class="size-4 text-muted-foreground" />
				</a>
			{/each}
		</nav>
	</Empty>
</div>
