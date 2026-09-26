import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  discoverAwsStage,
  type AwsDiscoveredResource,
  type AwsStageDiscovery
} from '@gatehouse/aws';
import {
  attachResourceToStage,
  cancelAwsStackMigration,
  getAwsDiscoverySnapshot,
  getManagedStage,
  listAwsStackMigrations,
  listStageIdsForResource,
  markAwsStackMigrationReady,
  prepareAwsStackMigration,
  saveAwsDiscoverySnapshot
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

function s3BucketFromOriginDomain(
  domainName: string
): string | null {
  const match = domainName.match(
    /^(.+)\.s3(?:[.-][^.]+)?\.amazonaws\.com$/i
  );

  return match?.[1] ?? null;
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
    const flags = [
      booleanDetail(discovered, 'blockPublicAcls'),
      booleanDetail(discovered, 'ignorePublicAcls'),
      booleanDetail(discovered, 'blockPublicPolicy'),
      booleanDetail(discovered, 'restrictPublicBuckets')
    ];

    const allBlocked = flags.every(Boolean);
    const allOpen = flags.every((value) => !value);

    if (!allBlocked && !allOpen) {
      throw new Error(
        'This S3 bucket uses mixed Public Access Block settings that GateHouse cannot reproduce exactly yet.'
      );
    }

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
        public: allOpen
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
    const partitionKey = stringDetail(discovered, 'partitionKey');
    const partitionKeyType = stringDetail(
      discovered,
      'partitionKeyType'
    );
    const sortKey = stringDetail(discovered, 'sortKey');
    const sortKeyType = stringDetail(discovered, 'sortKeyType');
    const billingMode = stringDetail(discovered, 'billingMode');
    const readCapacity = numberDetail(discovered, 'readCapacity');
    const writeCapacity = numberDetail(discovered, 'writeCapacity');
    const globalIndexes =
      numberDetail(discovered, 'globalSecondaryIndexes') ?? 0;
    const localIndexes =
      numberDetail(discovered, 'localSecondaryIndexes') ?? 0;

    if (globalIndexes || localIndexes) {
      throw new Error(
        'This DynamoDB table has secondary indexes. GateHouse will keep it inventory-only until index management is implemented.'
      );
    }

    if (
      !partitionKey ||
      !['S', 'N', 'B'].includes(partitionKeyType ?? '') ||
      (sortKey &&
        !['S', 'N', 'B'].includes(sortKeyType ?? '')) ||
      !['PAY_PER_REQUEST', 'PROVISIONED'].includes(
        billingMode ?? ''
      )
    ) {
      throw new Error(
        'DynamoDB discovery did not return a primary-key schema GateHouse can represent safely.'
      );
    }

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
          name: partitionKey,
          type: partitionKeyType as 'S' | 'N' | 'B'
        },
        sortKey: sortKey
          ? {
              name: sortKey,
              type: sortKeyType as 'S' | 'N' | 'B'
            }
          : undefined,
        billingMode: billingMode as
          | 'PAY_PER_REQUEST'
          | 'PROVISIONED',
        readCapacity:
          billingMode === 'PROVISIONED'
            ? readCapacity ?? 1
            : undefined,
        writeCapacity:
          billingMode === 'PROVISIONED'
            ? writeCapacity ?? 1
            : undefined,
        deletionProtection: booleanDetail(
          discovered,
          'deletionProtection'
        )
      }
    };
  }

  if (
    discovered.service === 'cloudfront' &&
    discovered.resourceType === 'AWS::CloudFront::Distribution'
  ) {
    const originCount = numberDetail(discovered, 'originCount') ?? 0;
    const originId = stringDetail(discovered, 'originId');
    const originDomainName = stringDetail(
      discovered,
      'originDomainName'
    );
    const originPath = stringDetail(discovered, 'originPath') ?? '';
    const originIsS3 = booleanDetail(discovered, 'originIsS3');
    const defaultTargetOriginId = stringDetail(
      discovered,
      'defaultTargetOriginId'
    );
    const cacheBehaviors =
      numberDetail(discovered, 'cacheBehaviors') ?? 0;
    const lambdaAssociations =
      numberDetail(discovered, 'lambdaAssociations') ?? 0;
    const functionAssociations =
      numberDetail(discovered, 'functionAssociations') ?? 0;
    const aliasesJson = stringDetail(discovered, 'aliases');
    const certificateArn = stringDetail(
      discovered,
      'certificateArn'
    );
    const defaultRootObject =
      stringDetail(discovered, 'defaultRootObject') ?? '';

    let aliases: string[] = [];

    try {
      const parsed = aliasesJson ? JSON.parse(aliasesJson) : [];
      aliases = Array.isArray(parsed)
        ? parsed.filter(
            (alias): alias is string =>
              typeof alias === 'string' && Boolean(alias.trim())
          )
        : [];
    } catch {
      aliases = [];
    }

    if (
      originCount !== 1 ||
      !originId ||
      !originDomainName ||
      !originIsS3 ||
      defaultTargetOriginId !== originId ||
      cacheBehaviors !== 0 ||
      lambdaAssociations !== 0 ||
      functionAssociations !== 0
    ) {
      throw new Error(
        'This CloudFront distribution has multiple origins, additional cache behaviours, or edge functions that GateHouse cannot reproduce safely yet.'
      );
    }

    const bucketName = s3BucketFromOriginDomain(originDomainName);

    if (!bucketName) {
      throw new Error(
        'GateHouse could not map the CloudFront origin to an S3 bucket safely.'
      );
    }

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

  return {
    ...context,
    discovery,
    imported,
    stackMigrations
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
