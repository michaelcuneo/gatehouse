export function renderNginx(resource: EndpointResource) {
	const spec = resource.spec;

	if (spec.mode === 'reverse_proxy') {
		return `
server {
    listen 80;

    server_name ${spec.host};

    location / {
        proxy_pass http://${spec.upstream.host}:${spec.upstream.port};

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
`;
	}

	return `
server {
    listen 80;

    server_name ${spec.host};

    root ${spec.root};

    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
}
