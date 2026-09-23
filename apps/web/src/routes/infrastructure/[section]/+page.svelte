<script lang="ts">
  let { data } = $props();
  const date = (value: string) => new Date(value).toLocaleString();
</script>

<main class="container">
  <span class="eyebrow">Infrastructure</span>
  <h1>{data.section.title}</h1>
  <p class="muted">{data.section.description}</p>

  <div class="section-head">
    <div>
      <span class="eyebrow">Desired state</span>
      <h2>{data.resources.length} resources</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.resources.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Healthy</th>
            <th>Last reconciled</th>
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
              <td>{resource.provider}</td>
              <td><span class={`status status-${resource.status}`}>{resource.status}</span></td>
              <td>
                {resource.runtime?.healthy === true
                  ? 'Yes'
                  : resource.runtime?.healthy === false
                    ? 'No'
                    : 'Unknown'}
              </td>
              <td class="muted">
                {resource.runtime?.lastReconciledAt
                  ? date(resource.runtime.lastReconciledAt as string)
                  : 'Never'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h2>No {data.section.title.toLowerCase()} configured</h2>
        <p class="muted">
          The resource model exists, but this provider has not yet been exposed through a create/reconcile workflow in the UI.
        </p>
      </div>
    {/if}
  </section>
</main>
