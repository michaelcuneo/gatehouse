import { ensureRuntime } from '@gatehouse/runtime';

import { initDatabase } from '@gatehouse/db';

let initialized = false;

export async function init() {
	if (initialized) {
		return;
	}

	await ensureRuntime();

	initDatabase();

	initialized = true;

	console.log('Gatehouse runtime initialized');
}
