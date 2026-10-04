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
	import { BUCKET_LABELS, BUCKET_ORDER, type BucketKind } from '$lib/bucket-meta';

	let {
		abierto = $bindable(false),
		origen = $bindable('short_term'),
		saldos,
		moneda = 'CUP',
		errores = {},
		valores = {}
	}: {
		abierto: boolean;
		/** Bolsillo del que sale el dinero. Lo fija la tarjeta desde la que se abre. */
		origen: BucketKind;
		saldos: Record<BucketKind, number>;
		moneda?: string;
		errores?: Record<string, string[] | undefined>;
		valores?: Record<string, string>;
	} = $props();

	// Igual que en movement-dialog: `page.form` sobrevive a un `fail(...)` y a
	// cerrar el diálogo, así que sin este flag se verían los errores del intento
	// anterior al abrir el formulario desde otra tarjeta.
	let enviado = $state(false);
	let procesando = $state(false);

	// El input no está ligado a un estado (su valor se repinta desde `valores` al
	// reintentar), así que lo que se está escribiendo se guarda aparte para poder
	// avisar del saldo en vivo.
	let montoEnVivo = $state('');

	// Los destinos son los otros dos. El origen no se elige aquí sino que viene
	// fijado por la tarjeta, de modo que por construcción el dinero siempre sale
	// de un bolsillo y entra en otro.
	const destinos = $derived(BUCKET_ORDER.filter((bolsillo) => bolsillo !== origen));
	const destinoPorDefecto = $derived(destinos[0]);

	const erroresVisibles = $derived(enviado ? errores : {});
	const valoresVisibles = $derived(enviado ? valores : {});

	const formatoMoneda = $derived(
		new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda })
	);

	const disponible = $derived(saldos[origen]);
	const monto = $derived(Number(montoEnVivo || (valoresVisibles.amount ?? '')));

	// El saldo se comprueba de verdad en el servidor, dentro de la transacción.
	// Esto es solo una vista previa para no hacer el viaje en balde. Number('')
	// es 0, así que un campo vacío no dispara el aviso.
	const excedeSaldo = $derived(
		Number.isFinite(monto) && monto > 0 && redondear(monto) > redondear(disponible)
	);

	function redondear(n: number): number {
		return Math.round(n * 100) / 100;
	}

	// Hoy en hora local y formato YYYY-MM-DD. toISOString() da UTC, y según la
	// hora y la zona podría devolver el día de ayer o de mañana.
	function hoyLocal(): string {
		const d = new Date();
		const mes = String(d.getMonth() + 1).padStart(2, '0');
		const dia = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${mes}-${dia}`;
	}

	$effect(() => {
		if (abierto) {
			enviado = false;
			montoEnVivo = '';
		}
	});
</script>

<Dialog bind:open={abierto}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Mover dinero</DialogTitle>
			<DialogDescription>
				Sacas de {BUCKET_LABELS[origen]} y lo pones en otro bolsillo. El total no
				cambia, solo el reparto.
			</DialogDescription>
		</DialogHeader>

		<form
			method="POST"
			action="?/transferBuckets"
			use:enhance={() => {
				enviado = true;
				procesando = true;
				return async ({ result, update }) => {
					await update();
					procesando = false;
					if (result.type === 'success') {
						abierto = false;
						toast.success('Dinero movido');
					} else if (result.type === 'failure') {
						// `result.data` viene como Record<string, unknown>, así que el
						// mensaje hay que estrecharlo. Los errores de campo se pintan
						// solos con `erroresVisibles`.
						toast.error(
							typeof result.data?.message === 'string'
								? result.data.message
								: 'Revisa los datos del formulario'
						);
					}
				};
			}}
		>
			<!-- El origen no es un campo editable: es el bolsillo desde el que se abrió
			     el diálogo. Aun así lo manda el formulario y el servidor lo vuelve a
			     validar, porque un input hidden también se puede retocar a mano. -->
			<input type="hidden" name="from" value={origen} />

			<FieldGroup>
				<Field data-invalid={!!erroresVisibles.to}>
					<FieldLabel for="to">Mover a</FieldLabel>
					<NativeSelect
						id="to"
						name="to"
						class="w-full"
						required
						aria-invalid={!!erroresVisibles.to}
						value={valoresVisibles.to ?? destinoPorDefecto}
					>
						{#each destinos as destino (destino)}
							<NativeSelectOption value={destino}>{BUCKET_LABELS[destino]}</NativeSelectOption>
						{/each}
					</NativeSelect>
					{#if erroresVisibles.to}
						<FieldError>{erroresVisibles.to[0]}</FieldError>
					{/if}
				</Field>

				<Field data-invalid={!!erroresVisibles.amount || excedeSaldo}>
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
						aria-invalid={!!erroresVisibles.amount || excedeSaldo}
						value={valoresVisibles.amount ?? ''}
						oninput={(event) => (montoEnVivo = event.currentTarget.value)}
					/>
					{#if erroresVisibles.amount}
						<FieldError>{erroresVisibles.amount[0]}</FieldError>
					{:else if excedeSaldo}
						<FieldError>
							No hay saldo suficiente: {BUCKET_LABELS[origen]} tiene {formatoMoneda.format(
								disponible
							)}
						</FieldError>
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
						value={valoresVisibles.date ?? hoyLocal()}
					/>
					{#if erroresVisibles.date}
						<FieldError>{erroresVisibles.date[0]}</FieldError>
					{/if}
				</Field>

				<Field data-invalid={!!erroresVisibles.description}>
					<FieldLabel for="description">
						Descripción <span class="text-muted-foreground">(opcional)</span>
					</FieldLabel>
					<Input
						id="description"
						name="description"
						type="text"
						maxlength={200}
						placeholder="Ahorro para el viaje"
						aria-invalid={!!erroresVisibles.description}
						value={valoresVisibles.description ?? ''}
					/>
					{#if erroresVisibles.description}
						<FieldError>{erroresVisibles.description[0]}</FieldError>
					{/if}
				</Field>
			</FieldGroup>

			<DialogFooter class="mt-6">
				<Button type="submit" disabled={procesando || excedeSaldo}>
					{procesando ? 'Moviendo…' : 'Mover dinero'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
