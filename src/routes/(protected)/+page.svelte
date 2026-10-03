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
	import { Card, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyTitle
	} from '$lib/components/ui/empty';
	import { Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data, form } = $props();

	let abierto = $state(false);
	// Movimiento en edición, o null si el diálogo es un alta nueva. Lo guarda el
	// diálogo para poder vaciar solo su copia sin tener que saber qué está editando.
	let editando = $state<MovimientoEditable | null>(null);
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

	function abrirNuevo(): void {
		editando = null;
		abierto = true;
	}

	function abrirEdicion(movimiento: MovimientoEditable): void {
		editando = movimiento;
		abierto = true;
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
	<Card>
		<CardHeader>
			<CardDescription>Corto plazo</CardDescription>
			<CardTitle class="tabular text-3xl">
				{formatoMoneda.format(data.bucketTotals.short_term)}
			</CardTitle>
		</CardHeader>
	</Card>

	<Card>
		<CardHeader>
			<CardDescription>Mediano plazo</CardDescription>
			<CardTitle class="tabular text-3xl">
				{formatoMoneda.format(data.bucketTotals.medium_term)}
			</CardTitle>
		</CardHeader>
	</Card>

	<Card>
		<CardHeader>
			<CardDescription>Largo plazo</CardDescription>
			<CardTitle class="tabular text-3xl">
				{formatoMoneda.format(data.bucketTotals.long_term)}
			</CardTitle>
		</CardHeader>
	</Card>
</div>

{#if data.recentMovements.length === 0}
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
			{#each data.recentMovements as movimiento (movimiento.id)}
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
