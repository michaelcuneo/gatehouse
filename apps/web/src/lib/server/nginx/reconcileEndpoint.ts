import { renderNginx } from './renderNginx';

import { applyNginxConfig } from './applyNginxConfig';

export async function reconcileEndpoint(resource: EndpointResource) {
	const config = renderNginx(resource);

	await applyNginxConfig(resource.id, config);
}
