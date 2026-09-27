<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Sidebar,
		SidebarContent,
		SidebarFooter,
		SidebarGroup,
		SidebarGroupContent,
		SidebarGroupLabel,
		SidebarHeader,
		SidebarInset,
		SidebarMenu,
		SidebarMenuButton,
		SidebarMenuItem,
		SidebarProvider,
		SidebarTrigger
	} from '$lib/components/ui/sidebar';
	import {
		LayoutDashboard,
		Landmark,
		LogOut,
		PiggyBank,
		Receipt,
		Wallet
	} from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: { user: { name: string; email: string } }; children: Snippet } =
		$props();
	const navegacion = [
		{ titulo: 'Resumen', href: '/', icono: LayoutDashboard },
		{ titulo: 'Cuentas', href: '/cuentas', icono: Landmark },
		{ titulo: 'Movimientos', href: '/movimientos', icono: Receipt },
		{ titulo: 'Presupuestos', href: '/presupuestos', icono: PiggyBank }
	];

	const iniciales = $derived(
		data.user.name
			.split(' ')
			.map((p) => p[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	);

	function activo(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<title>Lucas</title>
</svelte:head>

<SidebarProvider>
	<Sidebar collapsible="icon">
		<SidebarHeader>
			<div class="flex items-center gap-2 px-2 py-1.5">
				<div class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
					<Wallet class="size-4" />
				</div>
				<div class="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
					<span class="font-semibold">Lucas</span>
					<span class="text-xs text-muted-foreground">Tus finanzas</span>
				</div>
			</div>
		</SidebarHeader>

		<SidebarContent>
			<SidebarGroup>
				<SidebarGroupLabel>Finanzas</SidebarGroupLabel>
				<SidebarGroupContent>
					<SidebarMenu>
						{#each navegacion as item (item.href)}
							<SidebarMenuItem>
								<!-- SidebarMenuButton es un <button>; con el snippet `child`
								     lo convertimos en un <a> real para que funcione el
								     cmd+click, el enlace directo y el historial. -->
								<SidebarMenuButton
									isActive={activo(item.href)}
									tooltipContent={item.titulo}
								>
									{#snippet child({ props })}
										<a href={item.href} {...props}>
											<item.icono />
											<span>{item.titulo}</span>
										</a>
									{/snippet}
								</SidebarMenuButton>
							</SidebarMenuItem>
						{/each}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		</SidebarContent>

		<SidebarFooter>
			<div class="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
				<div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
					{iniciales}
				</div>
				<div class="grid min-w-0 flex-1 leading-tight">
					<span class="truncate text-sm font-medium">{data.user.name}</span>
					<span class="truncate text-xs text-muted-foreground">{data.user.email}</span>
				</div>
			</div>
			<Separator />
			<form method="POST" action="/logout">
				<Button type="submit" variant="ghost" class="w-full justify-start gap-2">
					<LogOut />
					<span class="group-data-[collapsible=icon]:hidden">Cerrar sesión</span>
				</Button>
			</form>
		</SidebarFooter>
	</Sidebar>

	<SidebarInset>
		<header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
			<SidebarTrigger class="-ml-1" />
		</header>

		<div class="flex flex-1 flex-col gap-6 p-6">
			{@render children()}
		</div>
	</SidebarInset>
</SidebarProvider>
