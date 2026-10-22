<script lang="ts">
	import ThemeSwitcher from '$lib/components/theme-switcher.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="fixed top-4 right-4 z-10">
	<ThemeSwitcher />
</div>

{@render children()}
