<script lang="ts" module>
	// Lo mínimo que el diálogo necesita para rellenar el formulario. Deliberadamente
	// no es el `Movement` completo: así el componente no arrastra el esquema de la BD
	// (módulo de servidor) hasta el bundle del cliente.
	export type MovimientoEditable = {
		id: string;
		amount: string;
		date: string;
		description: string | null;
		categoryId: string | null;
		type: 'income' | 'expense';
	};

	export type Categoria = {
		id: string;
		name: string;
		kind: 'income' | 'expense';
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Field, FieldError, FieldGroup, FieldLabel } from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';

	let {
		abierto = $bindable(false),
		movimiento = $bindable(null),
		categorias,
		errores = {},
		valores = {}
	}: {
		abierto: boolean;
		movimiento: MovimientoEditable | null;
		categorias: Categoria[];
		errores?: Record<string, string[] | undefined>;
		valores?: Record<string, string>;
	} = $props();

	// `page.form` sobrevive a un `fail(...)` y también a cerrar el diálogo, así que sin
	// este flag reabrir el formulario para otro movimiento mostraría los errores y los
	// valores del intento anterior. Solo se confianza en `form` tras un envío.
	let enviado = $state(false);
	let procesando = $state(false);

	const editando = $derived(movimiento !== null);

	// Un gasto no se reparte entre los bolsillos, así que sus categorías son las de gasto.
	const tipo = $derived(movimiento?.type ?? 'income');
	const categoriasVisibles = $derived(categorias.filter((c) => c.kind === tipo));

	const erroresVisibles = $derived(enviado ? errores : {});
	const valoresVisibles = $derived(enviado ? valores : {});

	// Hoy en hora local y formato YYYY-MM-DD. toISOString() da UTC, y según la
	// hora y la zona podría devolver el día de ayer o de mañana.
	function hoyLocal(): string {
		const d = new Date();
		const mes = String(d.getMonth() + 1).padStart(2, '0');
		const dia = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${mes}-${dia}`;
	}

	$effect(() => {
		// Cada vez que se abre, el formulario arranca limpio.
		if (abierto) enviado = false;
	});
</script>

<Dialog bind:open={abierto}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>{editando ? 'Editar movimiento' : 'Añadir ingreso'}</DialogTitle>
			<DialogDescription>
				{#if editando}
					Si cambias el monto, el reparto entre tus bolsillos se recalcula con tus
					porcentajes actuales.
				{:else}
					Registra un ingreso para empezar a mover tus cifras.
				{/if}
			</DialogDescription>
		</DialogHeader>

		<form
			method="POST"
			action={editando ? '?/updateMovement' : '?/addIncome'}
			use:enhance={() => {
				enviado = true;
				procesando = true;
				return async ({ result, update }) => {
					await update();
					procesando = false;
					if (result.type === 'success') {
						abierto = false;
						movimiento = null;
						toast.success(editando ? 'Movimiento actualizado' : 'Ingreso guardado');
					} else if (result.type === 'failure') {
						// `result.data` viene como Record<string, unknown>, así que el mensaje
						// hay que estrecharlo antes de dárselo al toast. Los errores de campo
						// se pintan solos con `erroresVisibles`.
						toast.error(
							typeof result.data?.message === 'string'
								? result.data.message
								: 'Revisa los datos del formulario'
						);
					}
				};
			}}
		>
			{#if movimiento}
				<input type="hidden" name="id" value={movimiento.id} />
			{/if}

			<FieldGroup>
				<Field data-invalid={!!erroresVisibles.amount}>
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
						aria-invalid={!!erroresVisibles.amount}
						value={valoresVisibles.amount ?? movimiento?.amount ?? ''}
					/>
					{#if erroresVisibles.amount}
						<FieldError>{erroresVisibles.amount[0]}</FieldError>
					{/if}
				</Field>

				<Field data-invalid={!!erroresVisibles.categoryId}>
					<FieldLabel for="categoryId">Categoría</FieldLabel>
					<NativeSelect
						id="categoryId"
						name="categoryId"
						class="w-full"
						value={valoresVisibles.categoryId ?? movimiento?.categoryId ?? ''}
						aria-invalid={!!erroresVisibles.categoryId}
					>
						<NativeSelectOption value="">Sin categoría</NativeSelectOption>
						{#each categoriasVisibles as categoria (categoria.id)}
							<NativeSelectOption value={categoria.id}>{categoria.name}</NativeSelectOption>
						{/each}
					</NativeSelect>
					{#if erroresVisibles.categoryId}
						<FieldError>{erroresVisibles.categoryId[0]}</FieldError>
					{/if}
				</Field>

				<Field data-invalid={!!erroresVisibles.date}>
					<FieldLabel for="date">Fecha</FieldLabel>
					<Input
						id="date"
						name="date"
						type="date"
						required
						aria-invalid={!!erroresVisibles.date}
						value={valoresVisibles.date ?? movimiento?.date ?? hoyLocal()}
					/>
					{#if erroresVisibles.date}
						<FieldError>{erroresVisibles.date[0]}</FieldError>
					{/if}
				</Field>

				<Field data-invalid={!!erroresVisibles.description}>
					<FieldLabel for="description">Descripción <span class="text-muted-foreground">(opcional)</span></FieldLabel>
					<Input
						id="description"
						name="description"
						type="text"
						maxlength={200}
						placeholder="Lo que cobre hoy en el trabajo"
						aria-invalid={!!erroresVisibles.description}
						value={valoresVisibles.description ?? movimiento?.description ?? ''}
					/>
					{#if erroresVisibles.description}
						<FieldError>{erroresVisibles.description[0]}</FieldError>
					{/if}
				</Field>
			</FieldGroup>

			<DialogFooter class="mt-6">
				<Button type="submit" disabled={procesando}>
					{procesando
						? 'Guardando…'
						: editando
							? 'Guardar cambios'
							: 'Guardar ingreso'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>