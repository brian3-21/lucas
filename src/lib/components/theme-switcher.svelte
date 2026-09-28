<script lang="ts">
	import { toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';

	/**
	 * Los dos iconos se montan siempre y se cruzan con `dark:`. Montar solo el
	 * icono activo provocaría un desajuste de hidratación: el servidor no sabe
	 * qué modo hay en localStorage y siempre renderizaría el mismo icono.
	 */
	let { class: className }: { class?: string } = $props();
</script>

<Button
	onclick={toggleMode}
	variant="outline"
	size="icon"
	class={cn('relative', className)}
	title="Cambiar entre claro y oscuro"
>
	<Sun class="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
	<Moon class="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
	<span class="sr-only">Cambiar tema</span>
</Button>
