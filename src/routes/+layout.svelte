<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { ModeWatcher } from 'mode-watcher';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	 * Colores reales de los tokens `--background` de `app.css`. Sirven para la
	 * barra del navegador en móvil: sin esto queda blanca en modo oscuro.
	 */
	const themeColors = { light: '#ffffff', dark: '#0a0a0a' };
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Lucas</title>
</svelte:head>

<!--
	ModeWatcher gestiona la clase `dark` en <html> e inyecta en el <head> un script
	bloqueante que la aplica antes del primer pintado (sin destello). También
	se encarga del <meta name="theme-color">; no lo declaramos aquí para no
	tener dos etiquetas y que el script no acabe Actualizando la equivocada.
-->
<ModeWatcher {themeColors} />

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>

<Toaster />
