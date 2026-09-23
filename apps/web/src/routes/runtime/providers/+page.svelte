<script lang="ts">
  let { data } = $props();
</script>

<main class="container">
  <span class="eyebrow">Runtime</span>
  <h1>Providers</h1>
  <p class="muted">
    Provider ownership and the resources currently attached to each runtime or cloud integration.
  </p>

  <div class="grid resource-kind-grid dashboard-metrics">
    {#each data.providers as provider}
      <article class="panel">
        <span class="eyebrow">Provider</span>
        <h2>{provider.name}</h2>
        <div class="metric-grid">
          <div class="metric">
            <span class="muted">Resources</span>
            <strong>{provider.count}</strong>
          </div>
          <div class="metric">
            <span class="muted">Ready</span>
            <strong>{provider.ready}</strong>
          </div>
          <div class="metric">
            <span class="muted">Errors</span>
            <strong>{provider.errors}</strong>
          </div>
        </div>
        <div class="stage-row">
          {#each provider.kinds as kind}
            <span class="pill mono">{kind}</span>
          {/each}
        </div>
      </article>
    {/each}

    {#if data.providers.length === 0}
      <section class="panel empty-state">
        <h2>No active providers</h2>
        <p class="muted">Providers appear here when resources are registered.</p>
      </section>
    {/if}
  </div>
</main>
