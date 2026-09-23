import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { assertAwsStageAccess } from '@gatehouse/aws';
import { getManagedStage, listResourcesForStage } from '@gatehouse/db';

export const load: PageServerLoad = async ({ params }) => {
  const context = getManagedStage(params.project, params.stage);

  if (!context) {
    throw error(404, 'Managed project stage not found.');
  }

  const resources = listResourcesForStage(context.stage.id);

  try {
    const identity = await assertAwsStageAccess(context.stage);

    return {
      ...context,
      resources,
      aws: {
        ok: true,
        identity
      }
    };
  } catch (cause) {
    return {
      ...context,
      resources,
      aws: {
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause)
      }
    };
  }
};
