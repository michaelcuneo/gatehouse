import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getResource } from '@gatehouse/db';

export const load: PageServerLoad = async ({ params }) => {
  const resource = getResource(params.id);

  if (!resource) {
    throw error(404, 'GateHouse resource not found.');
  }

  return { resource };
};
