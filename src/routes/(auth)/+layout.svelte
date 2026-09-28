<script lang="ts">
	import ThemeSwitcher from '$lib/components/theme-switcher.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!--
	El switcher va aquí y no en cada página de auth para que entrar, salir de
	sesión y registrarse compartan la misma posición. `fixed` lo saca del
	flujo: las páginas ya se centran con `min-h-svh`.
-->
<div class="fixed top-4 right-4 z-10">
	<ThemeSwitcher />
</div>

{@render children()}
