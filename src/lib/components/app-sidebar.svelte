<script lang="ts">
	import { page } from '$app/state';
	import NavUser from '$lib/components/nav-user.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Grid3x3, History, LayoutDashboard, Wallet, Atom } from '@lucide/svelte';

	let { user }: { user: { name: string; email: string } } = $props();

	// Resumen y movimientos por ahora. Cuentas y presupuestos están pensados,
	// pero todavía no: hay que decidir el modelo antes de enlazar a rutas que no existen.
	const navegacion = [
		{ titulo: 'Resumen', href: '/', icono: LayoutDashboard },
		{ titulo: 'Movimientos', href: '/movimientos', icono: History },
		{ titulo: 'Matriz ahorro', href: '/matriz-ahorro', icono: Grid3x3 },
		{ titulo: 'Estadisticas', href: '/estadisticas', icono: Atom }
	];

	function activo(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<Sidebar.Root collapsible="icon" variant="inset">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href="/" {...props}>
							<div
								class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
							>
								<Wallet class="size-4" />
							</div>
							<div
								class="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden"
							>
								<span class="truncate font-semibold">Lucas</span>
								<span class="truncate text-xs text-muted-foreground">Tus finanzas</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Finanzas</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each navegacion as item (item.href)}
						<Sidebar.MenuItem>
							<!-- SidebarMenuButton es un <button>; con el snippet `child`
							     lo convertimos en un <a> real para que funcione el
							     cmd+click, el enlace directo y el historial. -->
							<Sidebar.MenuButton isActive={activo(item.href)} tooltipContent={item.titulo}>
								{#snippet child({ props })}
									<a href={item.href} {...props}>
										<item.icono />
										<span>{item.titulo}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer>
		<NavUser {user} />
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
