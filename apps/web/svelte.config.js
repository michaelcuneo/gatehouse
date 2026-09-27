import path from 'node:path';
import { fileURLToPath } from 'node:url';

import adapter from '@sveltejs/adapter-auto';

const webDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(webDirectory, '../..');

const packageSource = (name) =>
	path.join(workspaceRoot, 'packages', name, 'src');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		alias: {
			'@gatehouse/aws': packageSource('aws'),
			'@gatehouse/core': packageSource('core'),
			'@gatehouse/db': packageSource('db'),
			'@gatehouse/observability': packageSource('observability'),
			'@gatehouse/providers': packageSource('providers'),
			'@gatehouse/reconciliation': packageSource('reconciliation'),
			'@gatehouse/resources': packageSource('resources'),
			'@gatehouse/runtime': packageSource('runtime'),
			'@gatehouse/shell': packageSource('shell'),
			'@gatehouse/types': packageSource('types'),
			'@gatehouse/validation': packageSource('validation')
		}
	}
};

export default config;
