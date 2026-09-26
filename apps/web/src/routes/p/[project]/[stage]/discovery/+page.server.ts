import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  applyCloudFormationRetention,
  assessAwsDiscoveryResource,
  assertImportableCloudFront,
  assertImportableDynamoDB,
  assertImportableS3,
  cloudFormationStackExists,
  summarizeAwsDiscoveryAdoption,
  detachCloudFormationStack,
  discoverAwsStage,
  verifyCloudFormationRetention,
  type AwsDiscoveredResource,
  type AwsStageDiscovery
} from '@gatehouse/aws';
import {
  attachResourceToStage,
  cancelAwsStackMigration,
  getAwsDiscoverySnapshot,
  getAwsStackMigration,
  getManagedStage,
  listAwsStackMigrations,
  listStageIdsForResource,
  markAwsStackMigrationReady,
  prepareAwsStackMigration,
  saveAwsDiscoverySnapshot,
  setAwsStackMigrationStatus
} from '@gatehouse/db';
import {
  checkResourceHealth,
  reconcileResource
} from '@gatehouse/reconciliation';
import {
  createResource,
  getResource,
  listResources,
  updateResource
} from '@gatehouse/resources';
import type { Resource } from '@gatehouse/types';

async function scan(
  stageId: string,
  stage: Parameters<typeof discoverAwsStage>[0]
) {
  const discovery = await discoverAwsStage(stage);

  saveAwsDiscoverySnapshot(
    stageId,
    discovery.scannedAt,
    discovery
  );

  return discovery;
}

function discoverySnapshot(stageId: string) {
  return getAwsDiscoverySnapshot<AwsStageDiscovery>(stageId)?.payload ?? null;
}

function discoveredResource(
  stageId: string,
  discoveryId: string
): AwsDiscoveredResource | null {
  return (
    discoverySnapshot(stageId)?.resources.find(
      (resource) => resource.id === discoveryId
    ) ?? null
  );
}

function importedResource(discoveryId: string) {
  return (
    listResources().find(
      (resource) =>
        resource.metadata?.importedFrom?.provider === 'aws' &&
        resource.metadata.importedFrom.discoveryId === discoveryId
    ) ?? null
  );
}

function importedResourceForDiscovered(
  discovered: AwsDiscoveredResource,
  discovery: AwsStageDiscovery
) {
  const direct = importedResource(discovered.id);

  if (direct) {
    return direct;
  }

  if (
    discovered.service === 'route53' &&
    discovered.resourceType === 'AWS::Route53::RecordSet' &&
    discovered.details?.alias === true &&
    discovered.details?.type === 'AAAA'
  ) {
    const pair = discovery.resources.find(
      (candidate) =>
        candidate.service === 'route53' &&
        candidate.resourceType === 'AWS::Route53::RecordSet' &&
        candidate.name === discovered.name &&
        candidate.details?.zone === discovered.details?.zone &&
        candidate.details?.type === 'A' &&
        candidate.details?.alias === true &&
        candidate.details?.aliasDnsName ===
          discovered.details?.aliasDnsName
    );

    return pair ? importedResource(pair.id) : null;
  }

  return null;
}

function booleanDetail(
  resource: AwsDiscoveredResource,
  key: string
) {
  return resource.details?.[key] === true;
}

function stringDetail(
  resource: AwsDiscoveredResource,
  key: string
) {
  const value = resource.details?.[key];
  return typeof value === 'string' ? value : null;
}

function numberDetail(
  resource: AwsDiscoveredResource,
  key: string
) {
  const value = resource.details?.[key];
  return typeof value === 'number' ? value : null;
}

function importedAwsResource(
  stageId: string,
  predicate: (resource: Resource) => boolean
) {
  return (
    listResources().find(
      (resource) =>
        resource.metadata?.importedFrom?.provider === 'aws' &&
        listStageIdsForResource(resource.id).includes(stageId) &&
        predicate(resource)
    ) ?? null
  );
}

function importableResource(
  discovered: AwsDiscoveredResource,
  accountId: string,
  stageId: string
): Resource {
  const now = new Date().toISOString();
  const ownership =
    discovered.ownership === 'external'
      ? {
          mode: 'external' as const,
          externalOwner: discovered.owner
            ? {
                type: discovered.owner.type,
                id: discovered.owner.id,
                name: discovered.owner.name
              }
            : undefined
        }
      : {
          mode: 'observed' as const
        };

  const metadata = {
    managed: false,
    ownership,
    importedFrom: {
      provider: 'aws' as const,
      discoveryId: discovered.id,
      physicalId: discovered.physicalId,
      accountId,
      region: discovered.region,
      importedAt: now
    }
  };

  if (
    discovered.service === 's3' &&
    discovered.resourceType === 'AWS::S3::Bucket'
  ) {
    const s3 = assertImportableS3(discovered);

    return {
      id: crypto.randomUUID(),
      kind: 'storage_bucket',
      name: discovered.name,
      provider: 's3',
      version: 1,
      enabled: true,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      metadata,
      runtime: {
        lastStatusMessage:
          discovered.ownership === 'external'
            ? 'Imported from AWS discovery; externally managed'
            : 'Imported from AWS discovery; observation only'
      },
      spec: {
        provider: 's3',
        bucket: discovered.physicalId,
        region: discovered.region,
        public: s3.public
      }
    };
  }

  if (
    discovered.service === 'route53' &&
    discovered.resourceType === 'AWS::Route53::RecordSet'
  ) {
    const type = stringDetail(discovered, 'type');
    const zone = stringDetail(discovered, 'zone');
    const value = stringDetail(discovered, 'value');
    const ttl = numberDetail(discovered, 'ttl');
    const alias = booleanDetail(discovered, 'alias');
    const aliasDnsName = stringDetail(
      discovered,
      'aliasDnsName'
    );
    const valueCount = numberDetail(discovered, 'valueCount');

    if (alias) {
      if (
        type !== 'A' ||
        !zone ||
        !aliasDnsName
      ) {
        throw new Error(
          'Import the A member of a CloudFront A/AAAA alias pair. GateHouse represents the pair as one DNS resource.'
        );
      }

      const snapshot = discoverySnapshot(stageId);

      const ipv6Pair = snapshot?.resources.find(
        (candidate) =>
          candidate.service === 'route53' &&
          candidate.resourceType === 'AWS::Route53::RecordSet' &&
          candidate.name === discovered.name &&
          stringDetail(candidate, 'zone') === zone &&
          stringDetail(candidate, 'type') === 'AAAA' &&
          booleanDetail(candidate, 'alias') &&
          stringDetail(candidate, 'aliasDnsName') === aliasDnsName
      );

      if (!ipv6Pair) {
        throw new Error(
          'GateHouse requires the matching AAAA CloudFront alias before importing this DNS pair.'
        );
      }

      const normalizedTarget =
        aliasDnsName.replace(/\.$/, '').toLowerCase();

      const distribution = snapshot?.resources.find(
        (candidate) =>
          candidate.service === 'cloudfront' &&
          candidate.resourceType === 'AWS::CloudFront::Distribution' &&
          String(candidate.details?.domainName ?? '')
            .replace(/\.$/, '')
            .toLowerCase() === normalizedTarget
      );

      if (!distribution) {
        throw new Error(
          'The CloudFront distribution targeted by this Route53 alias is not present in the saved discovery inventory.'
        );
      }

      const site = importedAwsResource(
        stageId,
        (resource) =>
          resource.kind === 'static_site' &&
          resource.metadata?.importedFrom?.discoveryId ===
            distribution.id
      );

      if (!site || site.kind !== 'static_site') {
        throw new Error(
          'Import the targeted CloudFront distribution before importing its Route53 alias.'
        );
      }

      return {
        id: crypto.randomUUID(),
        kind: 'dns_record',
        name: discovered.name.replace(/\.$/, ''),
        provider: 'route53',
        version: 1,
        enabled: true,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        metadata: {
          ...metadata,
          dependsOn: [site.id]
        },
        runtime: {
          lastStatusMessage:
            discovered.ownership === 'external'
              ? 'Imported CloudFront DNS alias; externally managed'
              : 'Imported CloudFront DNS alias pair; observation only'
        },
        spec: {
          mode: 'cloudfront_alias',
          zone,
          name: discovered.name.replace(/\.$/, ''),
          staticSiteId: site.id
        }
      };
    }

    if (
      valueCount !== 1 ||
      !zone ||
      !value ||
      ttl === null ||
      !['A', 'AAAA', 'CNAME', 'TXT'].includes(type ?? '')
    ) {
      throw new Error(
        'This Route53 record is not yet representable as a GateHouse value record.'
      );
    }

    return {
      id: crypto.randomUUID(),
      kind: 'dns_record',
      name: discovered.name.replace(/\.$/, ''),
      provider: 'route53',
      version: 1,
      enabled: true,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      metadata,
      runtime: {
        lastStatusMessage:
          discovered.ownership === 'external'
            ? 'Imported from AWS discovery; externally managed'
            : 'Imported from AWS discovery; observation only'
      },
      spec: {
        mode: 'value',
        zone,
        name: discovered.name.replace(/\.$/, ''),
        type: type as 'A' | 'AAAA' | 'CNAME' | 'TXT',
        value,
        ttl
      }
    };
  }

  if (
    discovered.service === 'dynamodb' &&
    discovered.resourceType === 'AWS::DynamoDB::Table'
  ) {
    const table = assertImportableDynamoDB(discovered);

    return {
      id: crypto.randomUUID(),
      kind: 'database_table',
      name: discovered.name,
      provider: 'dynamodb',
      version: 1,
      enabled: true,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      metadata,
      runtime: {
        lastStatusMessage:
          discovered.ownership === 'external'
            ? 'Imported from AWS discovery; externally managed'
            : 'Imported from AWS discovery; observation only'
      },
      spec: {
        provider: 'dynamodb',
        tableName: discovered.physicalId,
        region: discovered.region,
        partitionKey: {
          name: table.partitionKey,
          type: table.partitionKeyType
        },
        sortKey: table.sortKey
          ? {
              name: table.sortKey,
              type: table.sortKeyType!
            }
          : undefined,
        billingMode: table.billingMode,
        readCapacity: table.readCapacity,
        writeCapacity: table.writeCapacity,
        deletionProtection: table.deletionProtection
      }
    };
  }

  if (
    discovered.service === 'cloudfront' &&
    discovered.resourceType === 'AWS::CloudFront::Distribution'
  ) {
    const cloudFront = assertImportableCloudFront(discovered);
    const {
      originId,
      originPath,
      bucketName,
      aliases,
      certificateArn,
      defaultRootObject
    } = cloudFront;

    const storage = importedAwsResource(
      stageId,
      (resource) =>
        resource.kind === 'storage_bucket' &&
        resource.spec.provider === 's3' &&
        resource.spec.bucket === bucketName
    );

    if (!storage || storage.kind !== 'storage_bucket') {
      throw new Error(
        `Import the S3 bucket "${bucketName}" into this stage before importing this CloudFront distribution.`
      );
    }

    let certificateId: string | undefined;

    if (aliases.length) {
      if (!certificateArn) {
        throw new Error(
          'This CloudFront distribution uses custom aliases but no ACM certificate ARN was discovered.'
        );
      }

      const certificate = importedAwsResource(
        stageId,
        (resource) =>
          resource.kind === 'certificate' &&
          resource.spec.provider === 'aws_acm' &&
          resource.spec.certificateArn === certificateArn
      );

      if (!certificate || certificate.kind !== 'certificate') {
        throw new Error(
          'Import the CloudFront ACM certificate into this stage before importing this distribution.'
        );
      }

      certificateId = certificate.id;
    }

    return {
      id: crypto.randomUUID(),
      kind: 'static_site',
      name: discovered.name,
      provider: 's3',
      version: 1,
      enabled: true,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...metadata,
        dependsOn: [
          storage.id,
          ...(certificateId ? [certificateId] : [])
        ]
      },
      runtime: {
        lastStatusMessage:
          discovered.ownership === 'external'
            ? 'Imported CloudFront site; externally managed'
            : 'Imported CloudFront site; observation only'
      },
      spec: {
        contentMode: 'external',
        buildDirectory: '',
        storageId: storage.id,
        prefix: originPath.replace(/^\/+|\/+$/g, '') || undefined,
        cloudFront: {
          enabled: true,
          distributionId: discovered.physicalId,
          originId,
          defaultRootObject,
          aliases: aliases.length ? aliases : undefined,
          certificateId
        },
        deployOnChange: false
      }
    };
  }

  if (
    discovered.service === 'lambda' &&
    discovered.resourceType === 'AWS::Lambda::Function'
  ) {
    const memorySize = numberDetail(discovered, 'memorySize');
    const timeout = numberDetail(discovered, 'timeout');
    const architecture = stringDetail(
      discovered,
      'architecture'
    );
    const runtime = stringDetail(discovered, 'runtime');
    const handler = stringDetail(discovered, 'handler');
    const roleArn = stringDetail(discovered, 'roleArn');

    if (
      memorySize === null ||
      timeout === null ||
      !roleArn ||
      !['x86_64', 'arm64'].includes(architecture ?? '')
    ) {
      throw new Error(
        'Lambda discovery did not return enough configuration to import this function safely.'
      );
    }

    return {
      id: crypto.randomUUID(),
      kind: 'function',
      name: discovered.name,
      provider: 'lambda',
      version: 1,
      enabled: true,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      metadata,
      runtime: {
        lastStatusMessage:
          discovered.ownership === 'external'
            ? 'Imported Lambda function; externally managed'
            : 'Imported Lambda function; code and execution context retained externally'
      },
      spec: {
        provider: 'lambda',
        functionName: discovered.physicalId,
        region: discovered.region,
        codeMode: 'external',
        runtime: runtime || undefined,
        handler: handler || undefined,
        memorySize,
        timeout,
        architecture: architecture as 'x86_64' | 'arm64',
        roleArn
      }
    };
  }

  if (
    discovered.service === 'acm' &&
    discovered.resourceType ===
      'AWS::CertificateManager::Certificate' &&
    discovered.arn
  ) {
    const domainsJson = stringDetail(discovered, 'domains');
    const validation = stringDetail(discovered, 'validation');
    let domains: string[] = [];

    try {
      const parsed = domainsJson ? JSON.parse(domainsJson) : [];
      domains = Array.isArray(parsed)
        ? parsed.filter(
            (domain): domain is string =>
              typeof domain === 'string' && Boolean(domain.trim())
          )
        : [];
    } catch {
      domains = [];
    }

    if (!domains.length) {
      throw new Error(
        'ACM discovery did not return enough domain information to import this certificate safely.'
      );
    }

    return {
      id: crypto.randomUUID(),
      kind: 'certificate',
      name: discovered.name,
      provider: 'acm',
      version: 1,
      enabled: true,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      metadata,
      runtime: {
        lastStatusMessage:
          discovered.ownership === 'external'
            ? 'Imported from AWS discovery; externally managed'
            : 'Imported from AWS discovery; observation only'
      },
      spec: {
        provider: 'aws_acm',
        domains,
        autoRenew: true,
        region: discovered.region,
        certificateArn: discovered.arn,
        validation: validation === 'email' ? 'email' : 'dns'
      }
    };
  }

  throw new Error(
    'GateHouse can inventory this AWS resource, but it does not have a safe adoption model for it yet.'
  );
}

function requireStage(params: { project: string; stage: string }) {
  const context = getManagedStage(params.project, params.stage);

  if (!context) {
    throw error(404, 'Managed project stage not found.');
  }

  return context;
}

function resourceBelongsToStage(
  resourceId: string,
  stageId: string
) {
  return listStageIdsForResource(resourceId).includes(stageId);
}

export const load: PageServerLoad = async ({ params }) => {
  const context = requireStage(params);

  const snapshot =
    getAwsDiscoverySnapshot<AwsStageDiscovery>(context.stage.id);

  const discovery =
    snapshot?.payload ??
    await scan(context.stage.id, context.stage);

  const imported = Object.fromEntries(
    listResources()
      .filter(
        (resource) =>
          resource.metadata?.importedFrom?.provider === 'aws' &&
          resource.metadata.importedFrom.accountId === context.stage.accountId
      )
      .map((resource) => [
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

  const stackMigrations = Object.fromEntries(
    listAwsStackMigrations(context.stage.id).map((migration) => [
      migration.stackId,
      migration
    ])
  );

  const adoption = Object.fromEntries(
    discovery.resources.map((resource) => [
      resource.id,
      assessAwsDiscoveryResource(
        resource,
        discovery.resources
      )
    ])
  );

  return {
    ...context,
    discovery,
    imported,
    stackMigrations,
    adoption,
    adoptionSummary:
      summarizeAwsDiscoveryAdoption(discovery.resources)
  };
};

export const actions: Actions = {
  prepareMigration: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const stackId = String(form.get('stackId') ?? '').trim();
    const snapshot = discoverySnapshot(context.stage.id);
    const stack = snapshot?.stacks.find(
      (candidate) => candidate.id === stackId
    );

    if (!stack) {
      return fail(404, {
        error: 'Stack is not present in the saved discovery inventory.'
      });
    }

    const children = snapshot?.resources.filter(
      (resource) => resource.owner?.id === stack.id
    ) ?? [];

    if (!children.length) {
      return fail(409, {
        error: 'No discovered child resources were found for this stack.'
      });
    }

    prepareAwsStackMigration({
      stageId: context.stage.id,
      stackId: stack.id,
      stackName: stack.name,
      ownerType: stack.ownerType,
      region: stack.region
    });

    return {
      success: true,
      action: 'prepareMigration',
      stackId: stack.id,
      childCount: children.length
    };
  },

  verifyMigration: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const stackId = String(form.get('stackId') ?? '').trim();

    const discovery = await scan(
      context.stage.id,
      context.stage
    );
    const stack = discovery.stacks.find(
      (candidate) => candidate.id === stackId
    );

    if (!stack) {
      return fail(404, {
        error: 'Stack is not present in the refreshed discovery inventory.'
      });
    }

    const children = discovery.resources.filter(
      (resource) => resource.owner?.id === stack.id
    );
    const blockers: string[] = [];

    if (stack.resourceCount > children.length) {
      blockers.push(
        `${stack.resourceCount - children.length} stack resource(s) are not represented by GateHouse discovery yet`
      );
    }

    for (const child of children) {
      const imported = importedResourceForDiscovered(
        child,
        discovery
      );

      if (!imported) {
        blockers.push(
          `${child.resourceType} ${child.name} is not imported into GateHouse`
        );
        continue;
      }

      const healthy = await checkResourceHealth(imported.id);

      if (healthy !== true) {
        blockers.push(
          `${child.resourceType} ${child.name} does not match its imported GateHouse model`
        );
      }
    }

    if (blockers.length) {
      return fail(409, {
        error:
          'Stack migration is not ready for external detach.',
        action: 'verifyMigration',
        stackId,
        blockers
      });
    }

    markAwsStackMigrationReady(
      context.stage.id,
      stack.id
    );

    return {
      success: true,
      action: 'verifyMigration',
      stackId: stack.id,
      readyForDetach: true
    };
  },

  applyRetention: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const stackId = String(form.get('stackId') ?? '').trim();
    const migration = getAwsStackMigration(
      context.stage.id,
      stackId
    );

    if (!migration || migration.status !== 'ready_for_detach') {
      return fail(409, {
        error: 'Stack migration must be verified before retention policies can be applied.'
      });
    }

    if (migration.ownerType !== 'cloudformation') {
      return fail(409, {
        error:
          'Automatic detach is currently limited to plain CloudFormation stacks. SST and CDK stacks remain manual.'
      });
    }

    try {
      await applyCloudFormationRetention(
        context.stage,
        migration.region,
        migration.stackId
      );

      setAwsStackMigrationStatus(
        context.stage.id,
        migration.stackId,
        'retention_update_pending'
      );

      return {
        success: true,
        action: 'applyRetention',
        stackId: migration.stackId
      };
    } catch (cause) {
      return fail(409, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  },

  verifyRetention: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const stackId = String(form.get('stackId') ?? '').trim();
    const migration = getAwsStackMigration(
      context.stage.id,
      stackId
    );

    if (
      !migration ||
      !['retention_update_pending', 'retention_applied'].includes(
        migration.status
      )
    ) {
      return fail(409, {
        error: 'No retention update is awaiting verification for this stack.'
      });
    }

    try {
      const verification = await verifyCloudFormationRetention(
        context.stage,
        migration.region,
        migration.stackId
      );

      if (!verification.ready) {
        return fail(409, {
          error:
            'CloudFormation retention update is not complete yet' +
            (verification.status
              ? ` (stack status: ${verification.status})`
              : '.')
        });
      }

      setAwsStackMigrationStatus(
        context.stage.id,
        migration.stackId,
        'retention_applied'
      );

      return {
        success: true,
        action: 'verifyRetention',
        stackId: migration.stackId
      };
    } catch (cause) {
      return fail(409, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  },

  detachStack: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const stackId = String(form.get('stackId') ?? '').trim();
    const confirmation = String(
      form.get('confirmation') ?? ''
    ).trim();
    const migration = getAwsStackMigration(
      context.stage.id,
      stackId
    );

    if (!migration || migration.status !== 'retention_applied') {
      return fail(409, {
        error: 'Retention policies must be verified before the stack can be detached.'
      });
    }

    if (confirmation !== migration.stackName) {
      return fail(400, {
        error: 'Type the exact CloudFormation stack name to confirm detach.'
      });
    }

    try {
      await detachCloudFormationStack(
        context.stage,
        migration.region,
        migration.stackId
      );

      setAwsStackMigrationStatus(
        context.stage.id,
        migration.stackId,
        'detach_pending'
      );

      return {
        success: true,
        action: 'detachStack',
        stackId: migration.stackId
      };
    } catch (cause) {
      return fail(409, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  },

  confirmDetach: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const stackId = String(form.get('stackId') ?? '').trim();
    const migration = getAwsStackMigration(
      context.stage.id,
      stackId
    );

    if (!migration || migration.status !== 'detach_pending') {
      return fail(409, {
        error: 'This stack is not awaiting detach confirmation.'
      });
    }

    try {
      const stillExists = await cloudFormationStackExists(
        context.stage,
        migration.region,
        migration.stackId
      );

      if (stillExists) {
        return fail(409, {
          error: 'CloudFormation still reports the stack. Confirm detach again after stack deletion completes.'
        });
      }

      const before = discoverySnapshot(context.stage.id);

      if (!before) {
        return fail(409, {
          error: 'The pre-detach discovery snapshot is unavailable.'
        });
      }

      const previousChildren = before.resources.filter(
        (resource) => resource.owner?.id === migration.stackId
      );
      const refreshed = await scan(
        context.stage.id,
        context.stage
      );
      const missing = previousChildren.filter(
        (previous) =>
          !refreshed.resources.some(
            (current) => current.id === previous.id
          )
      );

      if (missing.length) {
        return fail(409, {
          error:
            'CloudFormation is gone but one or more retained resources are missing from AWS discovery: ' +
            missing.map((resource) => resource.name).join(', ')
        });
      }

      const updatedIds = new Set<string>();

      for (const child of previousChildren) {
        const imported = importedResourceForDiscovered(
          child,
          before
        );

        if (!imported || updatedIds.has(imported.id)) {
          continue;
        }

        updateResource({
          ...imported,
          metadata: {
            ...(imported.metadata ?? {}),
            managed: false,
            ownership: {
              mode: 'observed'
            }
          },
          status: 'ready',
          runtime: {
            ...(imported.runtime ?? {}),
            lastError: undefined,
            lastStatusMessage:
              'External stack ownership detached; resource remains observed until explicit GateHouse takeover'
          }
        });

        updatedIds.add(imported.id);
      }

      setAwsStackMigrationStatus(
        context.stage.id,
        migration.stackId,
        'detached'
      );

      return {
        success: true,
        action: 'confirmDetach',
        stackId: migration.stackId,
        retainedResources: previousChildren.length,
        reclassifiedResources: updatedIds.size
      };
    } catch (cause) {
      return fail(409, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  },

  cancelMigration: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const stackId = String(form.get('stackId') ?? '').trim();

    cancelAwsStackMigration(context.stage.id, stackId);

    return {
      success: true,
      action: 'cancelMigration',
      stackId
    };
  },

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
        action: 'refresh',
        scannedAt: discovery.scannedAt
      };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  },

  import: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const discoveryId = String(
      form.get('discoveryId') ?? ''
    ).trim();

    if (!discoveryId) {
      return fail(400, {
        error: 'A discovered AWS resource is required.'
      });
    }

    const discovered = discoveredResource(
      context.stage.id,
      discoveryId
    );

    if (!discovered) {
      return fail(404, {
        error:
          'That resource is not present in the saved AWS discovery snapshot. Refresh discovery first.'
      });
    }

    const existing = importedResource(discoveryId);

    if (existing) {
      return fail(409, {
        error: 'That AWS resource has already been imported.'
      });
    }

    try {
      const resource = importableResource(
        discovered,
        context.stage.accountId,
        context.stage.id
      );

      createResource(resource);
      attachResourceToStage(context.stage.id, resource.id);

      const healthy = await checkResourceHealth(resource.id);

      return {
        success: true,
        action: 'import',
        resourceId: resource.id,
        healthy
      };
    } catch (cause) {
      return fail(400, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  },

  dryRun: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const resourceId = String(
      form.get('resourceId') ?? ''
    ).trim();
    const resource = getResource(resourceId);

    if (
      !resource ||
      !resourceBelongsToStage(resource.id, context.stage.id)
    ) {
      return fail(404, {
        error: 'Imported GateHouse resource not found in this stage.'
      });
    }

    if (resource.metadata?.ownership?.mode === 'external') {
      return fail(409, {
        error:
          'This resource is still owned by CloudFormation, SST or CDK. Direct takeover is blocked.'
      });
    }

    try {
      const healthy = await checkResourceHealth(resource.id);

      return {
        success: true,
        action: 'dryRun',
        resourceId: resource.id,
        safeToAdopt: healthy === true
      };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  },

  takeControl: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const resourceId = String(
      form.get('resourceId') ?? ''
    ).trim();
    const resource = getResource(resourceId);

    if (
      !resource ||
      !resourceBelongsToStage(resource.id, context.stage.id)
    ) {
      return fail(404, {
        error: 'Imported GateHouse resource not found in this stage.'
      });
    }

    const ownership = resource.metadata?.ownership?.mode;

    if (ownership === 'external') {
      return fail(409, {
        error:
          'Direct takeover is blocked while CloudFormation, SST or CDK owns this resource.'
      });
    }

    if (ownership === 'gatehouse') {
      return {
        success: true,
        action: 'takeControl',
        resourceId: resource.id,
        alreadyOwned: true
      };
    }

    try {
      const healthy = await checkResourceHealth(resource.id);

      if (healthy !== true) {
        return fail(409, {
          error:
            'Dry run does not match live AWS state. GateHouse will not take control until the desired state is exact.'
        });
      }

      const controlled = updateResource({
        ...resource,
        metadata: {
          ...(resource.metadata ?? {}),
          managed: true,
          ownership: {
            mode: 'gatehouse'
          }
        }
      });

      try {
        await reconcileResource(controlled.id);
      } catch (cause) {
        updateResource({
          ...controlled,
          metadata: {
            ...(controlled.metadata ?? {}),
            managed: false,
            ownership: {
              mode: 'observed'
            }
          },
          status: 'ready',
          runtime: {
            ...(controlled.runtime ?? {}),
            lastError:
              cause instanceof Error
                ? cause.message
                : String(cause),
            lastStatusMessage:
              'Ownership rollback: initial GateHouse reconciliation failed'
          }
        });

        return fail(500, {
          error:
            'GateHouse did not retain ownership because the initial reconciliation failed: ' +
            (cause instanceof Error ? cause.message : String(cause))
        });
      }

      return {
        success: true,
        action: 'takeControl',
        resourceId: controlled.id,
        version: controlled.version
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
