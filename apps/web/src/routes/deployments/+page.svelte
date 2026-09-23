<script lang="ts">
  let { data } = $props();
</script>

<main class="container">
  <span class="eyebrow">GateHouse</span>
  <h1>Deployments</h1>
  <p class="muted">
    Deployment-capable GateHouse resources. Deployment history and release records are not persisted yet, so this view shows the current deployable desired state without inventing history that does not exist.
  </p>

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
            <th>Status</th>
            <th>Desired state</th>
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
              <td><span class={`status status-${resource.status}`}>{resource.status}</span></td>
              <td class="muted">
                {resource.kind === 'service'
                  ? 'Service deployment'
                  : 'Static site deployment'}
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
</main>
