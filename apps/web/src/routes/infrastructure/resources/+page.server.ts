import type { PageServerLoad } from './$types';

import { listResources } from '@gatehouse/db';

export const load: PageServerLoad = async () => {
  return {
    resources: listResources()
  };
};
