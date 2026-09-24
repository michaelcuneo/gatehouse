<script lang="ts">
  let { data, form } = $props();

  const date = (value?: string) => value ? new Date(value).toLocaleString() : 'Never';

  const duration = (startedAt: string, completedAt?: string) => {
    if (!completedAt) return 'Running';

    const elapsed = Math.max(
      0,
      Date.parse(completedAt) - Date.parse(startedAt)
    );

    if (elapsed < 1000) return '<1s';

    return `${Math.round(elapsed / 1000)}s`;
  };

  const statusClass = (status: string) =>
    status === 'succeeded'
      ? 'status-ready'
      : status === 'failed'
        ? 'status-error'
        : 'status-reconciling';
</script>

<main class="container">
  <span class="eyebrow">GateHouse</span>
  <h1>Deployments</h1>
  <p class="muted">
    Deployable GateHouse resources and persisted deployment execution history.
    Providers still own infrastructure operations; reconciliation records the lifecycle around them.
  </p>

  {#if form?.error}
    <p class="error mono">{form.error}</p>
  {:else if form?.success}
    <p class="muted mono">Deployment completed successfully.</p>
  {/if}

  <div class="section-head">
    <div>
      <span class="eyebrow">Deployable resources</span>
      <h2>{data.deployables.length} resources</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.deployables.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Provider</th>
            <th>Resource status</th>
            <th>Last deployment</th>
            <th>Result</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.deployables as resource}
            <tr>
              <td>
                <a href={`/infrastructure/resources/${resource.id}`}>
                  <strong>{resource.name}</strong>
                </a>
              </td>
              <td class="mono">{resource.kind}</td>
              <td>{resource.provider}</td>
              <td>
                <span class={`status status-${resource.status}`}>
                  {resource.status}
                </span>
              </td>
              <td class="muted">
                {resource.lastDeployment
                  ? date(resource.lastDeployment.startedAt)
                  : 'Never'}
              </td>
              <td>
                {#if resource.lastDeployment}
                  <span class={`status ${statusClass(resource.lastDeployment.status)}`}>
                    {resource.lastDeployment.status}
                  </span>
                {:else}
                  <span class="muted">—</span>
                {/if}
              </td>
              <td>
                <form method="POST" action="?/deploy">
                  <input type="hidden" name="resourceId" value={resource.id} />
                  <button class="button" type="submit" disabled={!resource.enabled}>
                    Deploy now
                  </button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h2>No deployable resources yet</h2>
        <p class="muted">
          Services and Static Site resources will appear here when they are configured.
        </p>
      </div>
    {/if}
  </section>

  <div class="section-head">
    <div>
      <span class="eyebrow">History</span>
      <h2>Recent deployments</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.history.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Started</th>
            <th>Resource</th>
            <th>Kind</th>
            <th>Provider</th>
            <th>Version</th>
            <th>Result</th>
            <th>Duration</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {#each data.history as deployment}
            <tr>
              <td class="muted">{date(deployment.startedAt)}</td>
              <td>
                <a href={`/infrastructure/resources/${deployment.resourceId}`}>
                  <strong>{deployment.resourceName}</strong>
                </a>
              </td>
              <td class="mono">{deployment.resourceKind}</td>
              <td>{deployment.provider}</td>
              <td class="mono">v{deployment.resourceVersion}</td>
              <td>
                <span class={`status ${statusClass(deployment.status)}`}>
                  {deployment.status}
                </span>
              </td>
              <td class="muted">
                {duration(deployment.startedAt, deployment.completedAt)}
              </td>
              <td class="muted mono">{deployment.message ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h2>No deployment history yet</h2>
        <p class="muted">
          The first service or static-site reconciliation will create a deployment record.
        </p>
      </div>
    {/if}
  </section>
</main>
