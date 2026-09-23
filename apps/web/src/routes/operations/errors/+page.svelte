<script lang="ts">
  let { data } = $props();
</script>

<main class="container">
  <span class="eyebrow">Operations</span>
  <h1>Errors</h1>
  <p class="muted">
    GateHouse reconciliation failures and project-specific operational errors.
  </p>

  <div class="section-head">
    <div>
      <span class="eyebrow">GateHouse runtime</span>
      <h2>{data.localErrors.length} resource errors</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.localErrors.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Kind</th>
            <th>Provider</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {#each data.localErrors as resource}
            <tr>
              <td><a href={`/infrastructure/resources/${resource.id}`}><strong>{resource.name}</strong></a></td>
              <td class="mono">{resource.kind}</td>
              <td>{resource.provider}</td>
              <td class="mono">{resource.runtime?.lastError ?? 'Unknown reconciliation error'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <p class="muted">No GateHouse-managed resources are currently in an error state.</p>
      </div>
    {/if}
  </section>

  <div class="section-head">
    <div>
      <span class="eyebrow">Registered systems</span>
      <h2>Project errors</h2>
    </div>
  </div>

  <div class="grid project-grid">
    {#each data.projects as project}
      {#each project.stages as stage}
        {#if stage.capabilities.errors}
          <a class="panel project-card" href={`/p/${project.slug}/${stage.name}/errors`}>
            <div>
              <span class="eyebrow">{stage.name}</span>
              <h2>{project.name}</h2>
              <p class="muted">CloudWatch grouped operational issues</p>
            </div>
            <span class="pill">Open errors</span>
          </a>
        {/if}
      {/each}
    {/each}
  </div>
</main>
