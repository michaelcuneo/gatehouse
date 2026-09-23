export function validateEndpoint(endpoint: EndpointResource) {
  const spec = endpoint.spec;

  if (!spec.host) {
    throw new Error('Host is required');
  }

  if (spec.mode === 'reverse_proxy') {
    if (!spec.upstream.host) {
      throw new Error('Upstream host is required');
    }

    if (!spec.upstream.port) {
      throw new Error('Upstream port is required');
    }
  }

  if (spec.mode === 'static' && !spec.root) {
    throw new Error('Static root is required');
  }
}
