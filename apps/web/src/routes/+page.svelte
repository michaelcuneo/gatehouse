<script lang="ts">
  let { data } = $props();

  const totalResources = $derived(
    Object.values(data.resourceCounts).reduce(
      (sum, value) => sum + (value ?? 0),
      0
    )
  );

  const healthy = $derived(data.statusCounts.ready ?? 0);
  const errors = $derived(data.statusCounts.error ?? 0);
</script>

<main class="container">
  <span class="eyebrow">Infrastructure management</span>
  <h1>Dashboard</h1>
  <p class="muted">
    GateHouse-owned infrastructure, runtime state and registered external systems.
  </p>

  <div class="metric-grid dashboard-metrics">
    <a class="panel metric" href="/infrastructure/resources">
      <span class="eyebrow">Resources</span>
      <strong>{totalResources}</strong>
      <span class="muted">managed by GateHouse</span>
    </a>

    <a class="panel metric" href="/infrastructure/resources">
      <span class="eyebrow">Ready</span>
      <strong>{healthy}</strong>
      <span class="muted">reconciled resources</span>
    </a>

    <a class="panel metric" href="/infrastructure/resources">
      <span class="eyebrow">Errors</span>
      <strong>{errors}</strong>
      <span class="muted">require attention</span>
    </a>

    <a class="panel metric" href="/projects">
      <span class="eyebrow">Projects</span>
      <strong>{data.projects.length}</strong>
      <span class="muted">registered systems</span>
    </a>
  </div>

  <div class="section-head">
    <div>
      <span class="eyebrow">Infrastructure</span>
      <h2>Managed resources</h2>
    </div>
    <a class="pill" href="/infrastructure/resources">View all resources</a>
  </div>

  <div class="grid resource-kind-grid">
    <a class="panel metric" href="/infrastructure/endpoints">
      <span class="eyebrow">Endpoints</span>
      <strong>{data.resourceCounts.endpoint ?? 0}</strong>
      <span class="muted">reverse proxies and static routes</span>
    </a>

    <a class="panel metric" href="/infrastructure/services">
      <span class="eyebrow">Services</span>
      <strong>{data.resourceCounts.service ?? 0}</strong>
      <span class="muted">node, bun, docker, python and binaries</span>
    </a>

    <a class="panel metric" href="/infrastructure/certificates">
      <span class="eyebrow">Certificates</span>
      <strong>{data.resourceCounts.certificate ?? 0}</strong>
      <span class="muted">TLS and ACM certificates</span>
    </a>

    <a class="panel metric" href="/infrastructure/dns">
      <span class="eyebrow">DNS</span>
      <strong>{data.resourceCounts.dns_record ?? 0}</strong>
      <span class="muted">Route53 records</span>
    </a>

    <a class="panel metric" href="/infrastructure/storage">
      <span class="eyebrow">Storage</span>
      <strong>{data.resourceCounts.storage_bucket ?? 0}</strong>
      <span class="muted">local and S3 storage</span>
    </a>

    <a class="panel metric" href="/infrastructure/static-sites">
      <span class="eyebrow">Static sites</span>
      <strong>{data.resourceCounts.static_site ?? 0}</strong>
      <span class="muted">local and S3 deployments</span>
    </a>
  </div>

  <div class="section-head">
    <div>
      <span class="eyebrow">Runtime state</span>
      <h2>Recently changed</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.recentResources.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Kind</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {#each data.recentResources as resource}
            <tr>
              <td>
                <a href={`/infrastructure/resources/${resource.id}`}>
                  <strong>{resource.name}</strong>
                </a>
              </td>
              <td class="mono muted">{resource.kind}</td>
              <td>{resource.provider}</td>
              <td><span class={`status status-${resource.status}`}>{resource.status}</span></td>
              <td class="muted">{new Date(resource.updatedAt).toLocaleString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h3>No managed resources yet</h3>
        <p class="muted">Create your first endpoint to exercise the GateHouse reconciliation runtime.</p>
        <a class="button" href="/infrastructure/endpoints">Create endpoint</a>
      </div>
    {/if}
  </section>
</main>
