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
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { BUCKET_LABELS, type BucketKind } from '$lib/bucket-meta';

	let {
		abierto = $bindable(false),
		bolsillo = $bindable('short_term'),
		saldo,
		moneda = 'CUP',
		errores = {},
		valores = {}
	}: {
		abierto: boolean;
		/** Bolsillo que se ajusta. Lo fija la tarjeta desde la que se abre. */
		bolsillo: BucketKind;
		saldo: number;
		moneda?: string;
		errores?: Record<string, string[] | undefined>;
		valores?: Record<string, string>;
	} = $props();

	// Igual que en movement-dialog y transfer-dialog: `page.form` sobrevive a un
	// `fail(...)` y a cerrar el diálogo, así que sin este flag se verían los errores
	// del intento anterior al abrir el formulario desde otra tarjeta.
	let enviado = $state(false);
	let procesando = $state(false);

	// Las dos formas de quitar dinero. Solo una se manda: el formulario no lleva el
	// campo de la otra, y el servidor además vuelve a validar cuál corresponde.
	let modo = $state<'difference' | 'manual'>('difference');

	// Los inputs no están ligados a un estado (su valor se repinta desde `valores`
	// al reintentar), así que lo que se está escribiendo se guarda aparte para poder
	// enseñar la diferencia en vivo.
	let contadoEnVivo = $state('');
	let montoEnVivo = $state('');

	const erroresVisibles = $derived(enviado ? errores : {});
	const valoresVisibles = $derived(enviado ? valores : {});

	const formatoMoneda = $derived(
		new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda })
	);

	function redondear(n: number): number {
		return Math.round(n * 100) / 100;
	}

	const saldoActual = $derived(redondear(saldo));

	// Number('' || undefined) es NaN, no 0: así un campo vacío o todavía sin
	// escribir no se confunde con "conté cero".
	const contado = $derived(Number(contadoEnVivo || valoresVisibles.countedAmount || NaN));
	const monto = $derived(Number(montoEnVivo || valoresVisibles.amount || NaN));

	const diferencia = $derived(redondear(contado - saldoActual));
	// El saldo que queda tras aplicar la diferencia es, por construcción, lo mismo
	// que el usuario acaba de contar. Se muestra igual para que se vea el camino.
	const saldoResultante = $derived(redondear(saldoActual + diferencia));
	const saldoTrasGasto = $derived(redondear(saldoActual - (Number.isFinite(monto) ? monto : 0)));

	// Los avisos de saldo son vista previa; el servidor los vuelve a comprobar
	// dentro de la transacción, que es la que manda.
	const excedeSaldo = $derived(
		modo === 'manual' && Number.isFinite(monto) && monto > 0 && redondear(monto) > saldoActual
	);
	const sinCambio = $derived(modo === 'difference' && Number.isFinite(contado) && diferencia === 0);

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
			modo = 'difference';
			contadoEnVivo = '';
			montoEnVivo = '';
		}
	});
</script>

<Dialog bind:open={abierto}>
	<!-- sm:max-w-md en vez del sm:max-w-sm por defecto: las filas de la diferencia
	     necesitan sitio para dos montos con decimales en la misma línea. -->
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>Quitar dinero de {BUCKET_LABELS[bolsillo]}</DialogTitle>
			<DialogDescription>
				{BUCKET_LABELS[bolsillo]} tiene
				<span class="font-medium text-foreground">{formatoMoneda.format(saldoActual)}</span> anotados.
				Cuenta cuánta dinero hay de verdad para que se ajuste sola, o descuenta un gasto.
			</DialogDescription>
		</DialogHeader>

		<form
			method="POST"
			action="?/adjustBucket"
			use:enhance={() => {
				enviado = true;
				procesando = true;
				return async ({ result, update }) => {
					await update();
					procesando = false;
					if (result.type === 'success') {
						abierto = false;
						toast.success(modo === 'manual' ? 'dinero descontada' : 'Ajuste aplicado');
					} else if (result.type === 'failure') {
						toast.error(
							typeof result.data?.message === 'string'
								? result.data.message
								: 'Revisa los datos del formulario'
						);
					}
				};
			}}
		>
			<!-- Ni el bolsillo ni el modo son campos editables: los fija la tarjeta desde
			     la que se abrió el diálogo y las pestañas. Aun así viajan en el
			     formulario y el servidor los vuelve a validar, porque un input hidden
			     también se puede retocar a mano. -->
			<input type="hidden" name="bucket" value={bolsillo} />
			<input type="hidden" name="mode" value={modo} />

			<Tabs bind:value={modo} class="gap-4">
				<TabsList class="w-full">
					<TabsTrigger value="difference">Cuánto tengo</TabsTrigger>
					<TabsTrigger value="manual">Cuánto gasté</TabsTrigger>
				</TabsList>

				{#if modo === 'difference'}
				<TabsContent value="difference" class="pt-4">
					<FieldGroup>
						<Field data-invalid={!!erroresVisibles.countedAmount}>
							<FieldLabel for="countedAmount">Cuánta dinero hay ahora</FieldLabel>
							<Input
								id="countedAmount"
								name="countedAmount"
								type="number"
								inputmode="decimal"
								step="0.01"
								min="0"
								placeholder="0.00"
								required
								aria-invalid={!!erroresVisibles.countedAmount}
								value={valoresVisibles.countedAmount ?? ''}
								oninput={(event) => (contadoEnVivo = event.currentTarget.value)}
							/>
							{#if erroresVisibles.countedAmount}
								<FieldError>{erroresVisibles.countedAmount[0]}</FieldError>
							{/if}
						</Field>

						<!-- La diferencia se enseña antes de mandar nada: es justo el dato que
						     el usuario no tiene y hace falta para decidir. -->
						{#if Number.isFinite(contado)}
							<div class="rounded-lg border bg-muted/40 p-3" aria-live="polite">
								<div class="flex items-baseline justify-between gap-3 text-sm">
									<span class="shrink-0 text-muted-foreground">Tenías anotado</span>
									<span class="tabular-nums">{formatoMoneda.format(saldoActual)}</span>
								</div>
								<div class="flex items-baseline justify-between gap-3 text-sm">
									<span class="shrink-0 text-muted-foreground">Contaste</span>
									<span class="tabular-nums">{formatoMoneda.format(redondear(contado))}</span>
								</div>
								{#if sinCambio}
									<FieldError class="mt-2">
										Es justo el dinero que ya tenías anotada. Cambia el número para que
										ajuste algo.
									</FieldError>
								{:else}
									<div
										class="mt-2 flex items-baseline justify-between gap-3 border-t pt-2 text-sm"
									>
										<span class="shrink-0 font-medium">Diferencia</span>
										<span
											class="tabular-nums font-medium {diferencia < 0
												? 'text-destructive'
												: 'text-emerald-600 dark:text-emerald-500'}"
										>
											{diferencia > 0 ? '+' : ''}{formatoMoneda.format(diferencia)}
										</span>
									</div>
									<p class="mt-2 text-xs text-muted-foreground">
										Quedan
										<span class="font-medium text-foreground">
											{formatoMoneda.format(saldoResultante)}
										</span>
										en {BUCKET_LABELS[bolsillo]}.
									</p>
								{/if}
							</div>
						{/if}
					</FieldGroup>
				</TabsContent>
				{/if}

				{#if modo === 'manual'}
				<TabsContent value="manual" class="pt-4">
					<FieldGroup>
						<Field data-invalid={!!erroresVisibles.amount || excedeSaldo}>
							<FieldLabel for="amount">Cuánta dinero gasté</FieldLabel>
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
									No hay saldo suficiente: {BUCKET_LABELS[bolsillo]} tiene
									{formatoMoneda.format(saldoActual)}
								</FieldError>
							{/if}
						</Field>

						{#if Number.isFinite(monto) && monto > 0 && !excedeSaldo}
							<p class="text-sm text-muted-foreground" aria-live="polite">
								Se restan
								<span class="font-medium text-foreground">{formatoMoneda.format(redondear(monto))}</span>
								y quedan
								<span class="font-medium text-foreground">
									{formatoMoneda.format(saldoTrasGasto)}
								</span>
								en {BUCKET_LABELS[bolsillo]}.
							</p>
						{/if}
					</FieldGroup>
				</TabsContent>
				{/if}
			</Tabs>

			<FieldGroup class="mt-4">
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
						placeholder="Comida del lunes"
						aria-invalid={!!erroresVisibles.description}
						value={valoresVisibles.description ?? ''}
					/>
					{#if erroresVisibles.description}
						<FieldError>{erroresVisibles.description[0]}</FieldError>
					{/if}
				</Field>
			</FieldGroup>

			<DialogFooter class="mt-6">
				<Button type="submit" style="cursor: pointer;" disabled={procesando || excedeSaldo || sinCambio}>
					{procesando
						? 'Ajustando…'
						: modo === 'manual'
							? 'Restar dinero'
							: 'Ajustar por la diferencia'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>