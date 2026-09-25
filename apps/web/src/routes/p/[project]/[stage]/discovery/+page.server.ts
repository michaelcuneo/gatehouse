import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { discoverAwsStage } from '@gatehouse/aws';
import { getManagedStage } from '@gatehouse/db';

export const load: PageServerLoad = async ({ params }) => {
  const context = getManagedStage(params.project, params.stage);

  if (!context) {
    throw error(404, 'Managed project stage not found.');
  }

  const discovery = await discoverAwsStage(context.stage);

  return {
    ...context,
    discovery
  };
};
