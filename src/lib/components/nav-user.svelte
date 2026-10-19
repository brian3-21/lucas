<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { ChevronsUpDown, LogOut } from '@lucide/svelte';

	let { user }: { user: { name: string; email: string } } = $props();

	const iniciales = $derived(
		user.name
			.split(' ')
			.map((p) => p[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);

	let formularioSalida: HTMLFormElement | undefined;

	function cerrarSesion() {
		formularioSalida?.requestSubmit();
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						size="lg"
						{...props}
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						<Avatar.Root class="size-8 shrink-0 rounded-lg after:rounded-lg">
							<Avatar.Fallback class="rounded-lg text-xs font-medium">
								{iniciales}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
							<span class="truncate font-medium">{user.name}</span>
							<span class="truncate text-xs text-muted-foreground">{user.email}</span>
						</div>
						<ChevronsUpDown class="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>

			<DropdownMenu.Content side="top" align="end" sideOffset={4} class="min-w-56 rounded-lg">
				<DropdownMenu.Label class="p-0 font-normal">
					<div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
						<Avatar.Root class="size-8 shrink-0 rounded-lg after:rounded-lg">
							<Avatar.Fallback class="rounded-lg text-xs font-medium">
								{iniciales}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid flex-1 leading-tight">
							<span class="truncate font-medium">{user.name}</span>
							<span class="truncate text-xs text-muted-foreground">{user.email}</span>
						</div>
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onSelect={cerrarSesion}>
					<LogOut />
					Cerrar sesión
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>

<form bind:this={formularioSalida} method="POST" action="/logout" class="hidden"></form>
