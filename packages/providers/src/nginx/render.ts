import type { EndpointResource } from "@gatehouse/types";

export function renderEndpoint(resource: EndpointResource) {
  return `
server {
	server_name ${resource.spec.host};

	location / {
		proxy_pass http://${resource.spec.upstream.host}:${resource.spec.upstream.port};
	}
}
`.trim();
}
