<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import MovimientoDialog, { type MovimientoEditable } from '$lib/components/movement-dialog.svelte';
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
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyTitle
	} from '$lib/components/ui/empty';
	import * as Pagination from '$lib/components/ui/pagination';
	import {
		ArrowRight,
		ArrowRightLeft,
		CirclePlus,
		Pencil,
		Plus,
		Scale,
		Trash2
	} from '@lucide/svelte';
	import { BUCKET_LABELS } from '$lib/bucket-meta';
	import { cn } from '$lib/utils';

	let { data, form } = $props();

	let abierto = $state(false);
	let editando = $state<MovimientoEditable | null>(null);
	let borrando = $state<string | null>(null);

	const errores = $derived(form?.errors ?? {});
	const valores = $derived(form?.values ?? {});

	const formatoMoneda = $derived(
		new Intl.NumberFormat('es-ES', { style: 'currency', currency: data.user?.baseCurrency ?? 'CUP' })
	);
	const formatoFecha = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

	function fechaLegible(iso: string): string {
		return formatoFecha.format(new Date(`${iso}T00:00:00`));
	}

	const historial = $derived(data.historialPaginado);

	function abrirEdicion(movimiento: MovimientoEditable): void {
		editando = movimiento;
		abierto = true;
	}
</script>

<svelte:head>
	<title>Movimientos · Lucas</title>
</svelte:head>

<header class="mb-6">
	<p class="text-sm text-muted-foreground">Panel</p>
	<h1 class="text-3xl font-semibold tracking-tight">Movimientos</h1>
</header>

{#if historial.length === 0}
	<Empty class="border border-dashed">
		<EmptyHeader>
			<EmptyTitle>Todavía no hay datos</EmptyTitle>
			<EmptyDescription>
				Registra tu primer ingreso y estas cifras empezarán a cobrar vida.
			</EmptyDescription>
		</EmptyHeader>
		<EmptyContent>
			<Button variant="outline" href="/">
				<Plus />
				Añadir tu primer ingreso
			</Button>
		</EmptyContent>
	</Empty>
{:else}
	<section>
		<ul class="divide-y rounded-lg border">
			{#each historial as linea (linea.clave)}
				{#if linea.tipo === 'movimiento'}
					{@const movimiento = linea.movimiento}
					<li class="flex items-center gap-3 px-4 py-3">
						<span
							class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
						>
							<CirclePlus class="size-3.5"></CirclePlus>
						</span>
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
		{#if data.totalItems > 0}
			<Pagination.Root
				count={data.totalItems}
				perPage={10}
				page={data.page}
				onPageChange={(e) => {
					const params = new URLSearchParams(window.location.search);
					params.set('offset', String((e - 1) * 10));
					window.location.search = params.toString();
				}}
				class="mx-0 w-auto border-t"
			>
				{#snippet children({ pages, currentPage })}
					<Pagination.Content class="gap-1">
						<Pagination.Item>
							<Pagination.Previous />
						</Pagination.Item>
						{#each pages as p (p.key)}
							{#if p.type === "ellipsis"}
								<Pagination.Item>
									<Pagination.Ellipsis />
								</Pagination.Item>
							{:else}
								<Pagination.Item>
									<Pagination.Link page={p} isActive={currentPage === p.value}>{p.value}</Pagination.Link>
								</Pagination.Item>
							{/if}
						{/each}
						<Pagination.Item>
							<Pagination.Next />
						</Pagination.Item>
					</Pagination.Content>
				{/snippet}
			</Pagination.Root>
		{/if}
		{#if data.historialPaginado.length === 0 && data.prevOffset !== null}
			<div class="flex justify-center px-4 py-3 border-t">
				<a href="?offset={data.prevOffset}" class="text-sm text-muted-foreground hover:text-foreground">
					← Volver a la página anterior
				</a>
			</div>
		{/if}
	</section>
{/if}

<MovimientoDialog
	bind:abierto
	bind:movimiento={editando}
	categorias={data.categories}
	errores={errores}
	valores={valores}
/>
