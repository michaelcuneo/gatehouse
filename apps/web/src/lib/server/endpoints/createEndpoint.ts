import { sqlite } from '$lib/server/db/client';

import { reconcileResource } from '$lib/server/reconciliation/reconcileResource';

export async function createEndpoint(resource: EndpointResource) {
	const stmt = sqlite.prepare(`
        INSERT INTO endpoints (
            id,
            name,
            type,
            enabled,
            spec,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

	stmt.run(
		resource.id,
		resource.name,
		resource.spec.mode,
		resource.enabled ? 1 : 0,
		JSON.stringify(resource.spec),
		resource.createdAt,
		resource.updatedAt
	);

	await reconcileResource(resource);

	return resource;
}
