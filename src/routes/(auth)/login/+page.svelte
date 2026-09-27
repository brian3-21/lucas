<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Field, FieldError, FieldGroup, FieldLabel } from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';

	let { form } = $props();

	const errores = $derived(form?.errors ?? {});
	const valores = $derived(form?.values ?? {});

	// `page.form` no sirve para esto: sigue relleno tras un `fail(...)`, así que
	// el botón se quedaría desactivado para siempre en el primer intento fallido.
	let procesando = $state(false);
</script>

<svelte:head>
	<title>Entrar · Lucas</title>
</svelte:head>

<div class="flex min-h-svh items-center justify-center p-4">
	<Card class="w-full max-w-sm">
		<CardHeader>
			<CardTitle>Entrar</CardTitle>
			<CardDescription>Accede a tus finanzas</CardDescription>
		</CardHeader>

		<CardContent>
			{#if form?.message}
				<Alert variant="destructive" class="mb-4">
					<AlertDescription>{form.message}</AlertDescription>
				</Alert>
			{/if}

			<form
				method="POST"
				use:enhance={() => {
					procesando = true;
					return async ({ update }) => {
						await update();
						procesando = false;
					};
				}}
			>
				<FieldGroup>
					<Field data-invalid={!!errores.email}>
						<FieldLabel for="email">Email</FieldLabel>
						<Input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							aria-invalid={!!errores.email}
							value={valores.email ?? ''}
						/>
						{#if errores.email}
							<FieldError>{errores.email[0]}</FieldError>
						{/if}
					</Field>

					<Field data-invalid={!!errores.password}>
						<FieldLabel for="password">Contraseña</FieldLabel>
						<Input
							id="password"
							name="password"
							type="password"
							autocomplete="current-password"
							required
							aria-invalid={!!errores.password}
						/>
						{#if errores.password}
							<FieldError>{errores.password[0]}</FieldError>
						{/if}
					</Field>
				</FieldGroup>

				<Button type="submit" class="mt-6 w-full" disabled={procesando}>
					{procesando ? 'Entrando…' : 'Entrar'}
				</Button>
			</form>

			<p class="mt-4 text-center text-sm text-muted-foreground">
				¿No tienes cuenta?
				<a href="/register" class="underline underline-offset-4">Créala</a>
			</p>
		</CardContent>
	</Card>
</div>
