<script lang="ts">
  let { data, form } = $props();

  const external = $derived(
    data.discovery.resources.filter((resource) => resource.ownership === 'external')
  );

  const observed = $derived(
    data.discovery.resources.filter((resource) => resource.ownership === 'observed')
  );

  const supportsImport = (resource: (typeof data.discovery.resources)[number]) => {
    if (
      resource.service === 's3' &&
      resource.resourceType === 'AWS::S3::Bucket'
    ) {
      const flags = [
        resource.details?.blockPublicAcls === true,
        resource.details?.ignorePublicAcls === true,
        resource.details?.blockPublicPolicy === true,
        resource.details?.restrictPublicBuckets === true
      ];

      return flags.every(Boolean) || flags.every((value) => !value);
    }

    if (
      resource.service === 'acm' &&
      resource.resourceType === 'AWS::CertificateManager::Certificate'
    ) {
      return Boolean(resource.arn && resource.details?.domains);
    }

    if (
      resource.service === 'dynamodb' &&
      resource.resourceType === 'AWS::DynamoDB::Table'
    ) {
      return (
        Number(resource.details?.globalSecondaryIndexes ?? 0) === 0 &&
        Number(resource.details?.localSecondaryIndexes ?? 0) === 0 &&
        typeof resource.details?.partitionKey === 'string' &&
        ['S', 'N', 'B'].includes(
          String(resource.details?.partitionKeyType ?? '')
        ) &&
        ['PAY_PER_REQUEST', 'PROVISIONED'].includes(
          String(resource.details?.billingMode ?? '')
        )
      );
    }

    if (
      resource.service === 'cloudfront' &&
      resource.resourceType === 'AWS::CloudFront::Distribution'
    ) {
      return (
        resource.details?.originCount === 1 &&
        resource.details?.originIsS3 === true &&
        resource.details?.defaultTargetOriginId ===
          resource.details?.originId &&
        Number(resource.details?.cacheBehaviors ?? 0) === 0 &&
        Number(resource.details?.lambdaAssociations ?? 0) === 0 &&
        Number(resource.details?.functionAssociations ?? 0) === 0
      );
    }

    if (
      resource.service === 'lambda' &&
      resource.resourceType === 'AWS::Lambda::Function'
    ) {
      return (
        typeof resource.details?.roleArn === 'string' &&
        typeof resource.details?.memorySize === 'number' &&
        typeof resource.details?.timeout === 'number' &&
        ['x86_64', 'arm64'].includes(
          String(resource.details?.architecture ?? '')
        )
      );
    }

    if (
      resource.service === 'route53' &&
      resource.resourceType === 'AWS::Route53::RecordSet'
    ) {
      return (
        resource.details?.alias !== true &&
        resource.details?.valueCount === 1 &&
        ['A', 'AAAA', 'CNAME', 'TXT'].includes(String(resource.details?.type ?? '')) &&
        typeof resource.details?.zone === 'string' &&
        typeof resource.details?.value === 'string' &&
        typeof resource.details?.ttl === 'number'
      );
    }

    return false;
  };

  const importedFor = (discoveryId: string) =>
    data.imported[discoveryId] ?? null;

  const dryRunPassedFor = (resourceId: string) =>
    form?.action === 'dryRun' &&
    form?.resourceId === resourceId &&
    form?.safeToAdopt === true;
</script>

<main class="container">
  <div class="section-head">
    <div>
      <span class="eyebrow">{data.project.name} / {data.stage.name}</span>
      <h1>AWS discovery</h1>
      <p class="muted">
        Inventory is read-only until you explicitly import a resource and then promote it to GateHouse ownership.
      </p>
    </div>

    <div class="stage-row">
      <form method="POST" action="?/refresh">
        <button class="pill" type="submit">Refresh inventory</button>
      </form>

      <a class="pill" href={'/p/' + data.project.slug + '/' + data.stage.name}>
        Back to stage
      </a>
    </div>
  </div>

  <p class="muted mono">
    Last scanned {new Date(data.discovery.scannedAt).toLocaleString()}
  </p>

  {#if form?.error}
    <p class="error mono">{form.error}</p>
  {:else if form?.action === 'import' && form?.success}
    <p class="muted mono">
      Resource imported into GateHouse as read-only local desired state.
    </p>
  {:else if form?.action === 'dryRun' && form?.success}
    <p class={form.safeToAdopt ? 'muted mono' : 'error mono'}>
      {form.safeToAdopt
        ? 'Dry run passed: live AWS state matches the imported GateHouse model.'
        : 'Dry run did not match: GateHouse will not take control.'}
    </p>
  {:else if form?.action === 'takeControl' && form?.success}
    <p class="muted mono">
      GateHouse ownership enabled and reconciliation verified.
    </p>
  {/if}

  <div class="metric-grid dashboard-metrics">
    <article class="panel metric">
      <span class="eyebrow">Resources</span>
      <strong>{data.discovery.resources.length}</strong>
      <span class="muted">discovered</span>
    </article>

    <article class="panel metric">
      <span class="eyebrow">External ownership</span>
      <strong>{external.length}</strong>
      <span class="muted">CloudFormation / SST / CDK</span>
    </article>

    <article class="panel metric">
      <span class="eyebrow">Observed</span>
      <strong>{observed.length}</strong>
      <span class="muted">not linked to a stack</span>
    </article>

    <article class="panel metric">
      <span class="eyebrow">Stacks</span>
      <strong>{data.discovery.stacks.length}</strong>
      <span class="muted">detected owners</span>
    </article>
  </div>

  {#if data.discovery.warnings.length}
    <section class="panel">
      <span class="eyebrow">Discovery warnings</span>
      <h2>Partial inventory</h2>
      {#each data.discovery.warnings as warning}
        <p class="error mono">{warning}</p>
      {/each}
    </section>
  {/if}

  <div class="section-head">
    <div>
      <span class="eyebrow">Ownership map</span>
      <h2>CloudFormation stacks</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.discovery.stacks.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Stack</th>
            <th>Owner</th>
            <th>Region</th>
            <th>Status</th>
            <th>Resources</th>
          </tr>
        </thead>
        <tbody>
          {#each data.discovery.stacks as stack}
            <tr>
              <td><strong>{stack.name}</strong></td>
              <td>{stack.ownerType}</td>
              <td>{stack.region}</td>
              <td class="mono">{stack.status}</td>
              <td>{stack.resourceCount}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h3>No CloudFormation stacks discovered</h3>
      </div>
    {/if}
  </section>

  <div class="section-head">
    <div>
      <span class="eyebrow">Estate inventory</span>
      <h2>Review and adopt</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.discovery.resources.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Service</th>
            <th>Region</th>
            <th>AWS ownership</th>
            <th>GateHouse</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {#each data.discovery.resources as resource}
            {@const imported = importedFor(resource.id)}
            <tr>
              <td>
                <strong>{resource.name}</strong>
                <div class="muted mono">{resource.resourceType}</div>
              </td>

              <td>{resource.service}</td>
              <td>{resource.region}</td>

              <td>
                <span class={resource.ownership === 'external' ? 'status status-pending' : 'status status-ready'}>
                  {resource.ownership}
                </span>

                {#if resource.owner}
                  <div class="muted">
                    {resource.owner.type}: {resource.owner.name}
                  </div>
                  {#if resource.owner.logicalId}
                    <div class="muted mono">{resource.owner.logicalId}</div>
                  {/if}
                {/if}
              </td>

              <td>
                {#if imported}
                  <a href={'/infrastructure/resources/' + imported.id}>
                    <span class={imported.ownership === 'gatehouse' ? 'status status-ready' : 'status status-pending'}>
                      {imported.ownership}
                    </span>
                  </a>

                  {#if imported.healthy === true}
                    <div class="muted">live state matches</div>
                  {:else if imported.healthy === false}
                    <div class="error">live state differs</div>
                  {/if}
                {:else}
                  <span class="muted">Not imported</span>
                {/if}
              </td>

              <td>
                {#if !imported}
                  {#if supportsImport(resource)}
                    <form method="POST" action="?/import">
                      <input type="hidden" name="discoveryId" value={resource.id} />
                      <button class="pill" type="submit">
                        Import read-only
                      </button>
                    </form>
                  {:else}
                    <span class="muted">Inventory only</span>
                  {/if}
                {:else if imported.ownership === 'external'}
                  <span class="muted">
                    Stack ownership must be transferred first
                  </span>
                {:else if imported.ownership === 'gatehouse'}
                  <span class="muted">GateHouse controlled</span>
                {:else}
                  <div class="stage-row">
                    <form method="POST" action="?/dryRun">
                      <input type="hidden" name="resourceId" value={imported.id} />
                      <button class="pill" type="submit">
                        Dry run
                      </button>
                    </form>

                    {#if dryRunPassedFor(imported.id)}
                      <form method="POST" action="?/takeControl">
                        <input type="hidden" name="resourceId" value={imported.id} />
                        <button class="button" type="submit">
                          Take control
                        </button>
                      </form>
                    {/if}
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h3>No AWS resources discovered</h3>
      </div>
    {/if}
  </section>
</main>
