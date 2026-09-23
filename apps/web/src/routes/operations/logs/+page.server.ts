import type { PageServerLoad } from './$types';

import { listManagedProjects } from '@gatehouse/db';

export const load: PageServerLoad = async () => {
  return {
    projects: listManagedProjects()
  };
};
