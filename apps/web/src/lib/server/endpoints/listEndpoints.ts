import { sqlite } from '$lib/server/db/client';

export async function listEndpoints() {
	const rows = sqlite
		.prepare(
			`
            SELECT * FROM endpoints
        `
		)
		.all();

	return rows.map((row: any) => ({
		...row,
		spec: JSON.parse(row.spec)
	}));
}
