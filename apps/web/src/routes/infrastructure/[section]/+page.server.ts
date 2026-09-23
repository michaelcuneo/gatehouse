import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { listResources, type StoredResourceKind } from '@gatehouse/db';
import { reconcileResource } from '@gatehouse/reconciliation';
import { createResource } from '@gatehouse/resources';

const sections: Record<
  string,
  { kind: StoredResourceKind; title: string; description: string }
> = {
  services: {
    kind: 'service',
    title: 'Services',
    description: 'Node, Bun, Docker, Python and binary services managed by GateHouse.'
  },
  certificates: {
    kind: 'certificate',
    title: 'Certificates',
    description: 'TLS certificates, wildcard certificates and AWS ACM resources.'
  },
  dns: {
    kind: 'dns_record',
    title: 'DNS',
    description: 'DNS desired state, including Route53 records.'
  },
  storage: {
    kind: 'storage_bucket',
    title: 'Storage',
    description: 'Local storage and AWS S3 resources.'
  },
  'static-sites': {
    kind: 'static_site',
    title: 'Static Sites',
    description: 'Deployable static sites targeting local storage or AWS.'
  }
};

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

export const load: PageServerLoad = async ({ params }) => {
  const section = sections[params.section];

  if (!section) {
    throw error(404, 'Infrastructure section not found.');
  }

  return {
    section,
    resources: listResources(section.kind),
    endpoints: listResources('endpoint'),
    storage: listResources('storage_bucket')
  };
};

export const actions: Actions = {
  create: async ({ params, request }) => {
    const section = sections[params.section];

    if (!section) {
      return fail(404, { error: 'Infrastructure section not found.' });
    }

    const form = await request.formData();
    const name = text(form, 'name');

    if (!name) {
      return fail(400, { error: 'Resource name is required.' });
    }

    const now = new Date().toISOString();
    let resource: Resource;

    if (params.section === 'storage') {
      const storagePath = text(form, 'path');

      if (!storagePath) {
        return fail(400, { error: 'Storage path is required.' });
      }

      resource = {
        id: crypto.randomUUID(),
        kind: 'storage_bucket',
        name,
        provider: 'filesystem',
        version: 1,
        enabled: true,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        metadata: {
          managed: true
        },
        spec: {
          provider: 'local',
          path: storagePath
        }
      };
    } else if (params.section === 'static-sites') {
      const buildDirectory = text(form, 'buildDirectory');
      const outputDirectory = text(form, 'outputDirectory');
      const endpointId = text(form, 'endpointId');
      const storageId = text(form, 'storageId');

      if (!buildDirectory || !outputDirectory) {
        return fail(400, {
          error: 'Build directory and output directory are required.'
        });
      }

      resource = {
        id: crypto.randomUUID(),
        kind: 'static_site',
        name,
        provider: 'filesystem',
        version: 1,
        enabled: true,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        metadata: {
          managed: true
        },
        spec: {
          buildDirectory,
          outputDirectory,
          endpointId: endpointId || undefined,
          storageId: storageId || undefined,
          deployOnChange: form.get('deployOnChange') === 'on'
        }
      };
    } else {
      return fail(400, {
        error: `Creation is not implemented for ${section.title} yet.`
      });
    }

    try {
      createResource(resource);
      await reconcileResource(resource.id);

      return { success: true };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }
};
