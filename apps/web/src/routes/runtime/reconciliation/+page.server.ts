import type { PageServerLoad } from './$types';

import { listResources } from '@gatehouse/db';

export const load: PageServerLoad = async () => {
  const resources = listResources().sort((a, b) => {
    const aTime = String(a.runtime?.lastReconciledAt ?? a.updatedAt);
    const bTime = String(b.runtime?.lastReconciledAt ?? b.updatedAt);
    return bTime.localeCompare(aTime);
  });

  return { resources };
};
