<script lang="ts">
  let { data } = $props();

  const external = $derived(
    data.discovery.resources.filter((resource) => resource.ownership === 'external')
  );

  const observed = $derived(
    data.discovery.resources.filter((resource) => resource.ownership === 'observed')
  );
</script>

<main class="container">
  <div class="section-head">
    <div>
      <span class="eyebrow">{data.project.name} / {data.stage.name}</span>
      <h1>AWS discovery</h1>
      <p class="muted">
        Read-only inventory. Nothing on this page is adopted or mutated by GateHouse.
      </p>
    </div>

    <a class="pill" href={'/p/' + data.project.slug + '/' + data.stage.name}>
      Back to stage
    </a>
  </div>

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
      <h2>Discovered resources</h2>
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
            <th>Ownership</th>
            <th>Current owner</th>
          </tr>
        </thead>
        <tbody>
          {#each data.discovery.resources as resource}
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
              </td>
              <td class="muted">
                {#if resource.owner}
                  {resource.owner.type}: {resource.owner.name}
                  {#if resource.owner.logicalId}
                    <div class="mono">{resource.owner.logicalId}</div>
                  {/if}
                {:else}
                  No stack owner detected
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
