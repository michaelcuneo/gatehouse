import type { PageServerLoad } from './$types';

import { listResources } from '@gatehouse/db';

export const load: PageServerLoad = async () => {
  const resources = listResources();

  return {
    deployables: resources.filter((resource) =>
      resource.kind === 'service' || resource.kind === 'static_site'
    )
  };
};
