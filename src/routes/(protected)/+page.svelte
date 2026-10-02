<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
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
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyTitle
	} from '$lib/components/ui/empty';
	import { Field, FieldError, FieldGroup, FieldLabel } from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data, form } = $props();

	let abierto = $state(false);
	// `page.form` no sirve para esto: sigue relleno tras un `fail(...)`, así que
	// el botón se quedaría desactivado para siempre en el primer intento fallido.
	let procesando = $state(false);
	// Id del movimiento que se está borrando, para bloquear solo esa fila.
	let borrando = $state<string | null>(null);

	const errores = $derived(form?.errors ?? {});
	const valores = $derived(form?.values ?? {});

	// Hoy en hora local y formato YYYY-MM-DD. toISOString() da UTC, y según la
	// hora y la zona podría devolver el día de ayer o de mañana.
	function hoyLocal(): string {
		const d = new Date();
		const mes = String(d.getMonth() + 1).padStart(2, '0');
		const dia = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${mes}-${dia}`;
	}

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
</script>

<svelte:head>
	<title>Resumen · Lucas</title>
</svelte:head>

<header class="mb-6 flex items-start justify-between gap-4">
	<div>
		<p class="text-sm text-muted-foreground">Panel</p>
		<h1 class="text-3xl font-semibold tracking-tight">Resumen</h1>
	</div>
	<Button class="cursor-pointer" onclick={() => (abierto = true)}>
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
				<Button variant="outline" onclick={() => (abierto = true)}>
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
							disabled
							aria-label="Editar movimiento"
							title="Todavía no disponible"
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

<Dialog bind:open={abierto}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Añadir ingreso</DialogTitle>
			<DialogDescription>Registra un ingreso para empezar a mover tus cifras.</DialogDescription>
		</DialogHeader>

		<form
			method="POST"
			action="?/addIncome"
			use:enhance={() => {
				procesando = true;
				return async ({ result, update }) => {
					await update();
					procesando = false;
					if (result.type === 'success') {
						abierto = false;
						toast.success('Ingreso guardado');
					}
				};
			}}
		>
			<FieldGroup>
				<Field data-invalid={!!errores.amount}>
					<FieldLabel for="amount">Monto</FieldLabel>
					<Input
						id="amount"
						name="amount"
						type="number"
						inputmode="decimal"
						step="0.01"
						min="0"
						placeholder="0.00"
						required
						aria-invalid={!!errores.amount}
						value={valores.amount ?? ''}
					/>
					{#if errores.amount}
						<FieldError>{errores.amount[0]}</FieldError>
					{/if}
				</Field>

				<Field data-invalid={!!errores.categoryId}>
					<FieldLabel for="categoryId">Categoría</FieldLabel>
					<NativeSelect
						id="categoryId"
						name="categoryId"
						class="w-full"
						aria-invalid={!!errores.categoryId}
					>
						<NativeSelectOption value="">Sin categoría</NativeSelectOption>
						{#each data.incomeCategories as categoria (categoria.id)}
							<NativeSelectOption value={categoria.id}>{categoria.name}</NativeSelectOption>
						{/each}
					</NativeSelect>
					{#if errores.categoryId}
						<FieldError>{errores.categoryId[0]}</FieldError>
					{/if}
				</Field>

				<Field data-invalid={!!errores.date}>
					<FieldLabel for="date">Fecha</FieldLabel>
					<Input
						id="date"
						name="date"
						type="date"
						required
						aria-invalid={!!errores.date}
						value={valores.date ?? hoyLocal()}
					/>
					{#if errores.date}
						<FieldError>{errores.date[0]}</FieldError>
					{/if}
				</Field>

				<Field data-invalid={!!errores.description}>
					<FieldLabel for="description">Descripción <span class="text-muted-foreground">(opcional)</span></FieldLabel>
					<Input
						id="description"
						name="description"
						type="text"
						maxlength={200}
						placeholder="Lo que cobre hoy en el trabajo"
						aria-invalid={!!errores.description}
						value={valores.description ?? ''}
					/>
					{#if errores.description}
						<FieldError>{errores.description[0]}</FieldError>
					{/if}
				</Field>
			</FieldGroup>

			<DialogFooter class="mt-6">
				<Button type="submit" disabled={procesando}>
					{procesando ? 'Guardando…' : 'Guardar ingreso'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
