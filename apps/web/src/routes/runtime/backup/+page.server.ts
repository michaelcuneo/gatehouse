import type { PageServerLoad } from './$types';

import { gateHouseStateCounts } from '@gatehouse/db';

export const load: PageServerLoad = async () => {
  return {
    counts: gateHouseStateCounts()
  };
};
