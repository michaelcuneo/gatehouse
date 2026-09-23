import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  getResource,
  updateResourceState
} from '@gatehouse/db';
import { reconcileResource } from '@gatehouse/reconciliation';

export const load: PageServerLoad = async ({ params }) => {
  const resource = getResource(params.id);

  if (!resource) {
    throw error(404, 'GateHouse resource not found.');
  }

  return { resource };
};

export const actions: Actions = {
  reconcile: async ({ params }) => {
    try {
      await reconcileResource(params.id);
      return { success: true, action: 'reconcile' };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  },

  toggle: async ({ params }) => {
    const resource = getResource(params.id);

    if (!resource) {
      return fail(404, { error: 'GateHouse resource not found.' });
    }

    updateResourceState(params.id, {
      enabled: !resource.enabled,
      status: 'pending',
      runtime: {
        lastStatusMessage: resource.enabled
          ? 'Resource disabled; runtime removal pending'
          : 'Resource enabled; reconciliation pending'
      }
    });

    try {
      await reconcileResource(params.id);
      return {
        success: true,
        action: resource.enabled ? 'disable' : 'enable'
      };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }
};
