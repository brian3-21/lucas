<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { ModeWatcher } from 'mode-watcher';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	Estos archivos +layout, +error. Se aplican tambien en el directorio en que estan y sus subdirectorios. 
	*/
	
	const themeColors = { light: '#ffffff', dark: '#0a0a0a' };
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Lucas</title>
</svelte:head>

<ModeWatcher {themeColors} />

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>

<Toaster />
