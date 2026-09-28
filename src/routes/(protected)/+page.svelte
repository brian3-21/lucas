<script lang="ts">
	import { Card, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '$lib/components/ui/empty';
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
				Estas cifras se rellenan solas en cuanto registres cuentas y movimientos.
			</EmptyDescription>
		</EmptyHeader>
	</Empty>
</div>
