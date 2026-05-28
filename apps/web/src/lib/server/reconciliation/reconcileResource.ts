import { reconcileEndpoint } from '$lib/server/providers/nginx/reconcileEndpoint';

export async function reconcileResource(
	resource: Resource
) {
	switch (resource.kind) {
		case 'endpoint':
			return reconcileEndpoint(resource);

		default:
			throw new Error(
				`Unknown resource kind: ${resource.kind}`
			);
	}
}