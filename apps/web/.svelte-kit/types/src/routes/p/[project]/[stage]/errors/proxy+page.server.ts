// @ts-nocheck
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getManagedStage } from '@gatehouse/db';
import {
  groupOperationalIssues,
  queryCloudWatchLogs
} from '@gatehouse/observability';
import { configuredLogGroups } from '$lib/server/observability/logGroups';

export const load = async ({ params, url }: Parameters<PageServerLoad>[0]) => {
  const context = getManagedStage(params.project, params.stage);

  if (!context) {
    throw error(404, 'Managed project stage not found.');
  }

  const logGroups = configuredLogGroups(context.stage);
  const hours = Math.min(Math.max(Number(url.searchParams.get('hours') ?? 6), 1), 24);
  const endTime = Date.now();
  const startTime = endTime - hours * 60 * 60 * 1000;

  if (logGroups.length === 0) {
    return {
      ...context,
      hours,
      issues: [],
      warning: 'No CloudWatch log groups are configured for this stage yet.'
    };
  }

  try {
    const events = await queryCloudWatchLogs(context.stage, {
      logGroups,
      startTime,
      endTime,
      limit: 1000
    });

    return {
      ...context,
      hours,
      issues: groupOperationalIssues(events),
      warning: null
    };
  } catch (cause) {
    return {
      ...context,
      hours,
      issues: [],
      warning: cause instanceof Error ? cause.message : String(cause)
    };
  }
};
