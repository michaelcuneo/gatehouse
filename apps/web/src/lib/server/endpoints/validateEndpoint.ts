export function validateEndpoint(endpoint: Endpoint) {
	if (!endpoint.host) {
		throw new Error('Host is required');
	}

	if (endpoint.type === 'reverse_proxy') {
		if (!endpoint.targetPort) {
			throw new Error('Target port required');
		}
	}

	if (endpoint.type === 'static') {
		if (!endpoint.root) {
			throw new Error('Static root required');
		}
	}
}
