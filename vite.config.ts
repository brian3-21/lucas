import fs from 'node:fs';
import path from 'node:path';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

const svelteKitDir = path.resolve('.svelte-kit');
const generatedDir = path.join(svelteKitDir, 'generated');

function findUnwritableGeneratedFile() {
	if (!fs.existsSync(svelteKitDir)) return null;

	const files = [path.join(svelteKitDir, 'tsconfig.json'), path.join(svelteKitDir, 'ambient.d.ts')];
	const nodesDir = path.join(generatedDir, 'client', 'nodes');

	if (fs.existsSync(nodesDir)) {
		for (const entry of fs.readdirSync(nodesDir, { withFileTypes: true })) {
			if (entry.isFile()) files.push(path.join(nodesDir, entry.name));
		}
	}

	for (const file of files) {
		if (!fs.existsSync(file)) continue;

		let fd: number | undefined;
		try {
			fd = fs.openSync(file, 'r+');
		} catch (error) {
			const { code, message } = error as NodeJS.ErrnoException;
			if (code === 'EPERM' || code === 'EACCES') {
				return { file, code, message };
			}
		} finally {
			if (fd !== undefined) fs.closeSync(fd);
		}
	}

	return null;
}

function svelteKitPermissionGuard(): Plugin {
	return {
		name: 'sveltekit-permission-guard',
		enforce: 'pre',
		apply: 'serve',
		configResolved() {
			const problem = findUnwritableGeneratedFile();
			if (!problem) return;

			throw new Error(
				[
					`SvelteKit no puede escribir en "${problem.file}".`,
					'',
					problem.message,
					'',
					'Esto no es un error de tu código. Los archivos generados de .svelte-kit',
					'no son escribibles por tu usuario. La causa más probable es que abriste',
					'VS Code (o la terminal) sin permisos de administrador, después de que',
					'otra sesión con permisos generara esos archivos.',
					'',
					'Cómo solucionarlo:',
					'  1. Cierra VS Code y cualquier "npm run dev" que esté corriendo.',
					'  2. Abre una terminal en el proyecto y ejecuta:',
					'',
					'       icacls ".svelte-kit" /grant "%USERNAME%:(OI)(CI)F" /T',
					'',
					'  3. Vuelve a ejecutar "npm run dev".',
					'',
					'Alternativa: abre VS Code como administrador o borra la carpeta',
					'.svelte-kit para que se regenere desde cero.'
				].join('\n')
			);
		}
	};
}

export default defineConfig({
	plugins: [
		svelteKitPermissionGuard(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	]
});
