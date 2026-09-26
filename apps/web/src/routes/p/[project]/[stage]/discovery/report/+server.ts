import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import {
  buildAwsDiscoveryDogfoodReport,
  type AwsStageDiscovery
} from '@gatehouse/aws';
import {
  getAwsDiscoverySnapshot,
  getManagedStage
} from '@gatehouse/db';
import {
  listImportedAwsResourcesForStage
} from '@gatehouse/resources';

export const GET: RequestHandler = async ({ params }) => {
  const context = getManagedStage(
    params.project,
    params.stage
  );

  if (!context) {
    throw error(404, 'Managed project stage not found.');
  }

  const snapshot =
    getAwsDiscoverySnapshot<AwsStageDiscovery>(
      context.stage.id
    );

  if (!snapshot) {
    throw error(
      404,
      'No saved AWS discovery snapshot exists for this stage. Refresh discovery first.'
    );
  }

  const discovery = snapshot.payload;
  const localImports = Object.fromEntries(
    listImportedAwsResourcesForStage(
      context.stage.id
    ).map((resource) => [
      resource.metadata!.importedFrom!.discoveryId,
      {
        id: resource.id,
        kind: resource.kind,
        ownership:
          resource.metadata?.ownership?.mode ??
          (resource.metadata?.managed === false
            ? 'external'
            : 'gatehouse'),
        healthy: resource.runtime?.healthy ?? null,
        status: resource.status
      }
    ])
  );
  const report = buildAwsDiscoveryDogfoodReport({
    project: context.project,
    stage: context.stage,
    discovery,
    localImports
  });

  const timestamp = discovery.scannedAt
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');

  return new Response(
    JSON.stringify(report, null, 2),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition':
          `attachment; filename="gatehouse-aws-discovery-${context.project.slug}-${context.stage.name}-${timestamp}.json"`,
        'cache-control': 'no-store'
      }
    }
  );
};
