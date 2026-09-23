import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { createEndpoint } from '$lib/server/endpoints/createEndpoint';
import { listEndpoints } from '$lib/server/endpoints/listEndpoints';

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

export const load: PageServerLoad = async () => {
  return {
    endpoints: await listEndpoints()
  };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();

    const name = text(form, 'name');
    const host = text(form, 'host');
    const mode = text(form, 'mode') === 'static' ? 'static' : 'reverse_proxy';
    const upstreamHost = text(form, 'upstreamHost') || '127.0.0.1';
    const upstreamPort = Number(text(form, 'upstreamPort'));
    const root = text(form, 'root');

    if (!name || !host) {
      return fail(400, { error: 'Name and hostname are required.' });
    }

    if (mode === 'reverse_proxy' && (!Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535)) {
      return fail(400, { error: 'A valid upstream port is required for reverse proxy endpoints.' });
    }

    if (mode === 'static' && !root) {
      return fail(400, { error: 'A filesystem root is required for static endpoints.' });
    }

    const now = new Date().toISOString();

    const resource: EndpointResource = {
      id: crypto.randomUUID(),
      kind: 'endpoint',
      name,
      provider: 'nginx',
      version: 1,
      enabled: true,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      metadata: {
        managed: true
      },
      spec:
        mode === 'reverse_proxy'
          ? {
              mode: 'reverse_proxy',
              host,
              upstream: {
                host: upstreamHost,
                port: upstreamPort
              },
              websocket: form.get('websocket') === 'on',
              redirectToHttps: form.get('redirectToHttps') === 'on'
            }
          : {
              mode: 'static',
              host,
              root,
              spaFallback: form.get('spaFallback') === 'on',
              redirectToHttps: form.get('redirectToHttps') === 'on'
            }
    };

    try {
      await createEndpoint(resource);
      return { success: true };
    } catch (cause) {
      return fail(500, {
        error:
          cause instanceof Error
            ? cause.message
            : 'Endpoint was saved but reconciliation failed.'
      });
    }
  }
};
