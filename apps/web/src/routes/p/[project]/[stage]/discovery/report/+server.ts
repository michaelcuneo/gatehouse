import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import {
  assessAwsDiscoveryResource,
  summarizeAwsDiscoveryAdoption,
  type AwsStageDiscovery
} from '@gatehouse/aws';
import {
  getAwsDiscoverySnapshot,
  getManagedStage
} from '@gatehouse/db';

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
  const summary =
    summarizeAwsDiscoveryAdoption(discovery.resources);
  const resources = discovery.resources.map((resource) => ({
    ...resource,
    adoption: assessAwsDiscoveryResource(
      resource,
      discovery.resources
    )
  }));

  const report = {
    format: 'gatehouse-aws-discovery-report',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      id: context.project.id,
      name: context.project.name,
      slug: context.project.slug
    },
    stage: {
      id: context.stage.id,
      name: context.stage.name,
      accountId: context.stage.accountId,
      primaryRegion: context.stage.primaryRegion,
      additionalRegions:
        context.stage.additionalRegions ?? []
    },
    discovery: {
      accountId: discovery.accountId,
      scannedAt: discovery.scannedAt,
      regions: discovery.regions,
      warnings: discovery.warnings,
      stacks: discovery.stacks,
      summary,
      resources
    }
  };

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
