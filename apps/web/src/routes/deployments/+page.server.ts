import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  getResource,
  listDeployments,
  listResources
} from '@gatehouse/db';
import { reconcileResource } from '@gatehouse/reconciliation';

export const load: PageServerLoad = async () => {
  const resources = listResources();
  const history = listDeployments({ limit: 250 });
  const latestByResource = new Map();

  for (const deployment of history) {
    if (!latestByResource.has(deployment.resourceId)) {
      latestByResource.set(deployment.resourceId, deployment);
    }
  }

  return {
    deployables: resources
      .filter((resource) =>
        resource.kind === 'service' || resource.kind === 'static_site'
      )
      .map((resource) => ({
        ...resource,
        lastDeployment: latestByResource.get(resource.id) ?? null
      })),
    history
  };
};

export const actions: Actions = {
  deploy: async ({ request }) => {
    const form = await request.formData();
    const resourceId = String(form.get('resourceId') ?? '').trim();

    if (!resourceId) {
      return fail(400, {
        error: 'A deployable resource is required'
      });
    }

    const resource = getResource(resourceId);

    if (!resource) {
      return fail(404, {
        error: 'Resource not found'
      });
    }

    if (resource.kind !== 'service' && resource.kind !== 'static_site') {
      return fail(400, {
        error: 'Only services and static sites can be deployed'
      });
    }

    if (!resource.enabled) {
      return fail(400, {
        error: 'Enable the resource before deploying it'
      });
    }

    try {
      await reconcileResource(resource.id, {
        forceDeployment: true
      });

      return {
        success: true,
        resourceId: resource.id
      };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }
};
