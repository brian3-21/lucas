<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import ThemeSwitcher from '$lib/components/theme-switcher.svelte';
	import { SidebarInset, SidebarProvider, SidebarTrigger } from '$lib/components/ui/sidebar';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: { user: { name: string; email: string } }; children: Snippet } =
		$props();
</script>

<svelte:head>
	<title>Lucas</title>
</svelte:head>

<SidebarProvider>
	<AppSidebar user={data.user} />

	<SidebarInset>
		<header class="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
			<SidebarTrigger class="-ml-1" />
			<ThemeSwitcher />
		</header>

		<div class="flex flex-1 flex-col gap-6 p-6">
			{@render children()}
		</div>
	</SidebarInset>
</SidebarProvider>
