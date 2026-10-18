<script lang="ts">
	import MovimientoDialog from '$lib/components/movement-dialog.svelte';
	import TransferDialog from '$lib/components/transfer-dialog.svelte';
	import AdjustmentDialog from '$lib/components/adjustment-dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardAction,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { ArrowRightLeft, Plus, Scale } from '@lucide/svelte';
	import { BUCKET_LABELS, BUCKET_ORDER, type BucketKind } from '$lib/bucket-meta';

	let { data, form } = $props();

	let abierto = $state(false);
	let origenTransferencia = $state<BucketKind>('short_term');
	let transferenciaAbierta = $state(false);
	let bolsilloAjuste = $state<BucketKind>('short_term');
	let ajusteAbierto = $state(false);

	const errores = $derived(form?.errors ?? {});
	const valores = $derived(form?.values ?? {});

	const formatoMoneda = $derived(
		new Intl.NumberFormat('es-ES', { style: 'currency', currency: data.user?.baseCurrency ?? 'CUP' })
	);

	function abrirNuevo(): void {
		abierto = true;
	}

	function abrirTransferencia(origen: BucketKind): void {
		origenTransferencia = origen;
		transferenciaAbierta = true;
	}

	function abrirAjuste(bolsillo: BucketKind): void {
		bolsilloAjuste = bolsillo;
		ajusteAbierto = true;
	}
</script>

<svelte:head>
	<title>Resumen · Lucas</title>
</svelte:head>

<header class="mb-6 flex items-start justify-between gap-4">
	<div>
		<p class="text-sm text-muted-foreground">Panel</p>
		<h1 class="text-3xl font-semibold tracking-tight">Resumen</h1>
	</div>
	<Button class="cursor-pointer" onclick={abrirNuevo}>
		<Plus />
		Añadir ingreso
	</Button>
</header>

<div class="grid gap-4 sm:grid-cols-3">
	{#each BUCKET_ORDER as bolsillo (bolsillo)}
		<Card>
			<CardHeader>
				<CardAction class="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						class="cursor-pointer"
						onclick={() => abrirAjuste(bolsillo)}
						aria-label={`Quitar plata de ${BUCKET_LABELS[bolsillo]}`}
					>
						<Scale />
						Ajustar
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="cursor-pointer"
						onclick={() => abrirTransferencia(bolsillo)}
						aria-label={`Mover dinero desde ${BUCKET_LABELS[bolsillo]}`}
					>
						<ArrowRightLeft />
						Mover
					</Button>
				</CardAction>
				<CardDescription>{BUCKET_LABELS[bolsillo]}</CardDescription>
				<CardTitle class="tabular text-3xl">
					{formatoMoneda.format(data.bucketTotals[bolsillo])}
				</CardTitle>
			</CardHeader>
		</Card>
	{/each}
</div>

<MovimientoDialog
	bind:abierto
	movimiento={null}
	categorias={data.categories}
	errores={errores}
	valores={valores}
/>
<TransferDialog
	bind:abierto={transferenciaAbierta}
	bind:origen={origenTransferencia}
	saldos={data.bucketTotals}
	moneda={data.user?.baseCurrency ?? 'CUP'}
	errores={errores}
	valores={valores}
/>
<AdjustmentDialog
	bind:abierto={ajusteAbierto}
	bind:bolsillo={bolsilloAjuste}
	saldo={data.bucketTotals[bolsilloAjuste]}
	moneda={data.user?.baseCurrency ?? 'CUP'}
	errores={errores}
	valores={valores}
/>
