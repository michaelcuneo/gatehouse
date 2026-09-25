import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  discoverAwsStage,
  type AwsStageDiscovery
} from '@gatehouse/aws';
import {
  getAwsDiscoverySnapshot,
  getManagedStage,
  saveAwsDiscoverySnapshot
} from '@gatehouse/db';

async function scan(stageId: string, stage: Parameters<typeof discoverAwsStage>[0]) {
  const discovery = await discoverAwsStage(stage);

  saveAwsDiscoverySnapshot(
    stageId,
    discovery.scannedAt,
    discovery
  );

  return discovery;
}

export const load: PageServerLoad = async ({ params }) => {
  const context = getManagedStage(params.project, params.stage);

  if (!context) {
    throw error(404, 'Managed project stage not found.');
  }

  const snapshot =
    getAwsDiscoverySnapshot<AwsStageDiscovery>(context.stage.id);

  const discovery =
    snapshot?.payload ??
    await scan(context.stage.id, context.stage);

  return {
    ...context,
    discovery
  };
};

export const actions: Actions = {
  refresh: async ({ params }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    try {
      const discovery = await scan(
        context.stage.id,
        context.stage
      );

      return {
        success: true,
        scannedAt: discovery.scannedAt
      };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  }
};
