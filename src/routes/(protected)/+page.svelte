<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import MovimientoDialog, { type MovimientoEditable } from '$lib/components/movement-dialog.svelte';
	import TransferDialog from '$lib/components/transfer-dialog.svelte';
	import AdjustmentDialog from '$lib/components/adjustment-dialog.svelte';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle,
		AlertDialogTrigger
	} from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import {
		Card,
		CardAction,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyTitle
	} from '$lib/components/ui/empty';
	import {
		ArrowRight,
		ArrowRightLeft,
		Pencil,
		Plus,
		Scale,
		Trash2
	} from '@lucide/svelte';
	import { BUCKET_LABELS, BUCKET_ORDER, type BucketKind } from '$lib/bucket-meta';
	import { cn } from '$lib/utils';

	let { data, form } = $props();

	let abierto = $state(false);
	// Movimiento en edición, o null si el diálogo es un alta nueva. Lo guarda el
	// diálogo para poder vaciar solo su copia sin tener que saber qué está editando.
	let editando = $state<MovimientoEditable | null>(null);
	// Bolsillo desde el que sale el dinero. Lo fija la tarjeta en la que se pulsa
	// "Mover": el diálogo no deja elegir otro origen.
	let origenTransferencia = $state<BucketKind>('short_term');
	let transferenciaAbierta = $state(false);
	// Bolsillo que se está ajustando y si el diálogo de ajuste está abierto. Igual
	// que la transferencia, la tarjeta decide de qué bolsillo se quita plata.
	let bolsilloAjuste = $state<BucketKind>('short_term');
	let ajusteAbierto = $state(false);
	// `page.form` no sirve para esto: sigue relleno tras un `fail(...)`, así que
	// el botón se quedaría desactivado para siempre en el primer intento fallido.
	let procesando = $state(false);
	// Id del movimiento que se está borrando, para bloquear solo esa fila.
	let borrando = $state<string | null>(null);

	const errores = $derived(form?.errors ?? {});
	const valores = $derived(form?.values ?? {});

	// Los importes se pintan en la moneda base del usuario, no en una fija: el
	// enum de Divisas ya incluye USD y los movimientos llevan su propia columna.
	// `data.user` viene del layout de (protected); el hook ya garantiza sesión,
	// pero el tipo de `locals.user` admite null, así que se cubre.
	const formatoMoneda = $derived(
		new Intl.NumberFormat('es-ES', { style: 'currency', currency: data.user?.baseCurrency ?? 'CUP' })
	);
	const formatoFecha = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

	// `date` llega como 'YYYY-MM-DD'. Sin la 'T00:00:00', Date lo parsea como
	// UTC y en zonas negativas pintaría el día anterior.
	function fechaLegible(iso: string): string {
		return formatoFecha.format(new Date(`${iso}T00:00:00`));
	}

	// Ingresos, traslados y ajustes se pintan en la misma lista y en el mismo orden:
	// son tres maneras de mover el mismo dinero, aunque no todas cambien el total.
	// La clave ordena por fecha y, a igualdad de fecha, por hora de creación.
	const historial = $derived(
		[
			...data.recentMovements.map((movimiento) => ({
				tipo: 'movimiento' as const,
				clave: `movimiento-${movimiento.id}`,
				orden: `${movimiento.date} ${movimiento.createdAt.toISOString()}`,
				movimiento
			})),
			...data.recentTransfers.map((traslado) => ({
				tipo: 'traslado' as const,
				clave: `traslado-${traslado.id}`,
				orden: `${traslado.date} ${traslado.createdAt.toISOString()}`,
				traslado
			})),
			...data.recentAdjustments.map((ajuste) => ({
				tipo: 'ajuste' as const,
				clave: `ajuste-${ajuste.id}`,
				orden: `${ajuste.date} ${ajuste.createdAt.toISOString()}`,
				ajuste
			}))
		].sort((a, b) => b.orden.localeCompare(a.orden))
	);

	function abrirNuevo(): void {
		editando = null;
		abierto = true;
	}

	function abrirEdicion(movimiento: MovimientoEditable): void {
		editando = movimiento;
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

{#if historial.length === 0}
	<div class="mt-6">
		<Empty class="border border-dashed">
			<EmptyHeader>
				<EmptyTitle>Todavía no hay datos</EmptyTitle>
				<EmptyDescription>
					Registra tu primer ingreso y estas cifras empezarán a cobrar vida.
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button variant="outline" onclick={abrirNuevo}>
					<Plus />
					Añadir tu primer ingreso
				</Button>
			</EmptyContent>
		</Empty>
	</div>
{:else}
	<section class="mt-6">
		<h2 class="mb-3 text-lg font-semibold tracking-tight">Últimos movimientos</h2>
		<ul class="divide-y rounded-lg border">
			{#each historial as linea (linea.clave)}
				{#if linea.tipo === 'movimiento'}
					{@const movimiento = linea.movimiento}
					<li class="flex items-center gap-3 px-4 py-3">
						<span
							class="size-2.5 shrink-0 rounded-full"
							style:background-color={movimiento.category?.color ?? 'var(--muted-foreground)'}
						></span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">
								{movimiento.description || movimiento.category?.name || 'Ingreso'}
							</p>
							<p class="text-xs text-muted-foreground">{fechaLegible(movimiento.date)}</p>
						</div>
						{#if movimiento.category}
							<Badge variant="secondary" class="hidden sm:inline-flex">
								{movimiento.category.name}
							</Badge>
						{/if}
						<span
							class="tabular shrink-0 text-sm font-semibold {movimiento.type === 'income'
								? 'text-green-600 dark:text-green-500'
								: 'text-red-600 dark:text-red-500'}"
						>
							{movimiento.type === 'income' ? '+' : '−'}{formatoMoneda.format(
								Number(movimiento.amount)
							)}
						</span>

						<div class="flex shrink-0 items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								class="cursor-pointer"
								onclick={() => abrirEdicion(movimiento)}
								aria-label="Editar movimiento"
							>
								<Pencil />
							</Button>

							<AlertDialog>
								<AlertDialogTrigger
									class={cn(
										buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
										'text-muted-foreground cursor-pointer hover:text-destructive'
									)}
									aria-label="Eliminar movimiento"
									disabled={borrando === movimiento.id}
								>
									<Trash2 />
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
										<AlertDialogDescription>
											Se borrará del historial y sus repartos entre los bolsillos se
											desharán. No se puede deshacer.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<form
											method="POST"
											action="?/deleteMovement"
											class="contents"
											use:enhance={() => {
												borrando = movimiento.id;
												return async ({ result, update }) => {
													await update();
													borrando = null;
													if (result.type === 'success') {
														toast.success('Movimiento eliminado');
													} else if (result.type === 'failure') {
														// `result.data` viene como Record<string, unknown>, así que
														// el mensaje hay que estrecharlo antes de dárselo al toast.
														toast.error(
															typeof result.data?.message === 'string'
																? result.data.message
																: 'No se pudo eliminar el movimiento'
														);
													}
												};
											}}
										>
											<input type="hidden" name="id" value={movimiento.id} />
											<!-- bits-ui renderiza el Cancel como <button> sin type, y dentro de un
											     form eso es type="submit": sin esto, "Cancelar" borra igual. -->
											<AlertDialogCancel
												type="button"
												class="cursor-pointer"
												disabled={borrando !== null}
											>
												Cancelar
											</AlertDialogCancel>
											<AlertDialogAction
												type="submit"
												variant="destructive"
												class="cursor-pointer"
												disabled={borrando !== null}
											>
												{borrando === movimiento.id ? 'Eliminando…' : 'Eliminar'}
											</AlertDialogAction>
										</form>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</li>
				{:else if linea.tipo === 'traslado'}
					{@const traslado = linea.traslado}
					<li class="flex items-center gap-3 px-4 py-3">
						<span
							class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
						>
							<ArrowRightLeft class="size-3.5" />
						</span>
						<div class="min-w-0 flex-1">
							<p class="flex items-center gap-1 truncate text-sm font-medium">
								{BUCKET_LABELS[traslado.from]}
								<ArrowRight class="size-3.5 shrink-0 text-muted-foreground" />
								{BUCKET_LABELS[traslado.to]}
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{fechaLegible(traslado.date)}{traslado.description
									? ` · ${traslado.description}`
									: ''}
							</p>
						</div>
						<!-- Sin signo +/− como los ingresos: el dinero no entra ni sale de la
						     cartera, solo cambia de bolsillo, y el título ya dice de cuál a cuál. -->
						<span class="tabular shrink-0 text-sm font-semibold text-muted-foreground">
							{formatoMoneda.format(Number(traslado.amount))}
						</span>
					</li>
				{:else}
					{@const ajuste = linea.ajuste}
					{@const deltaAjuste = Number(ajuste.amount)}
					<li class="flex items-center gap-3 px-4 py-3">
						<span
							class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
						>
							<Scale class="size-3.5" />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">
								{deltaAjuste < 0 ? 'Restaste' : 'Sumaste'}
								{formatoMoneda.format(Math.abs(deltaAjuste))}
								{deltaAjuste < 0 ? 'de' : 'a'}
								{BUCKET_LABELS[ajuste.bucket]}
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{fechaLegible(ajuste.date)}{ajuste.description ? ` · ${ajuste.description}` : ''}
							</p>
						</div>
						<!-- Con signo +/− como los ingresos, pero al revés de color: aquí el
						     verde es el bolsillo que crece y el rojo el que se vacía. -->
						<span
							class="tabular shrink-0 text-sm font-semibold {deltaAjuste < 0
								? 'text-red-600 dark:text-red-500'
								: 'text-green-600 dark:text-green-500'}"
						>
							{deltaAjuste > 0 ? '+' : '−'}{formatoMoneda.format(Math.abs(deltaAjuste))}
						</span>
					</li>
				{/if}
			{/each}
		</ul>
	</section>
{/if}
<MovimientoDialog
	bind:abierto
	bind:movimiento={editando}
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
