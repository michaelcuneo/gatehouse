<script lang="ts">
  let { data } = $props();

  const date = (value: string) => new Date(value).toLocaleString();
</script>

<main class="container">
  <span class="eyebrow">Infrastructure</span>
  <h1>Resources</h1>
  <p class="muted">
    Desired state and runtime state for infrastructure owned by GateHouse.
  </p>

  <section class="panel table-panel dashboard-metrics">
    {#if data.resources.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Enabled</th>
            <th>Last update</th>
          </tr>
        </thead>
        <tbody>
          {#each data.resources as resource}
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
              <td>{resource.enabled ? 'Yes' : 'No'}</td>
              <td class="muted">{date(resource.updatedAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h2>No GateHouse resources</h2>
        <p class="muted">Create an endpoint to add the first managed resource.</p>
        <a class="button" href="/infrastructure/endpoints">Create endpoint</a>
      </div>
    {/if}
  </section>
</main>
