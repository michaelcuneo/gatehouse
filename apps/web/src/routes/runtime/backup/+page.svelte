<script lang="ts">
  let { data } = $props();

  const labels: Record<string, string> = {
    resources: 'Resources',
    managed_projects: 'Projects',
    managed_project_stages: 'Stages',
    managed_project_resources: 'Stage/resource links',
    audit_logs: 'Audit entries',
    aws_discovery_snapshots: 'AWS discovery snapshots',
    aws_stack_migrations: 'AWS stack migrations',
    deployments: 'Deployments'
  };
</script>

<main class="container">
  <div class="section-head">
    <div>
      <span class="eyebrow">Runtime</span>
      <h1>Backup</h1>
      <p class="muted">
        Export GateHouse's local control-plane state without changing AWS or runtime infrastructure.
      </p>
    </div>

    <a class="button" href="/runtime/backup/export">
      Export state JSON
    </a>
  </div>

  <section class="panel">
    <span class="eyebrow">Portable state</span>
    <h2>Included records</h2>

    <div class="metric-grid dashboard-metrics">
      {#each Object.entries(data.counts) as [table, count]}
        <article class="metric">
          <strong>{count}</strong>
          <span class="muted">{labels[table] ?? table}</span>
        </article>
      {/each}
    </div>
  </section>

  <section class="panel">
    <span class="eyebrow">Format</span>
    <h2>gatehouse-state v1</h2>
    <p class="muted">
      The export contains the local GateHouse registry, desired-state resources,
      ownership metadata, discovery snapshots, migration plans, deployment history
      and audit history. It does not contain AWS access keys or copy any AWS resources.
    </p>
    <p class="muted">
      Restore/import is intentionally separate from export and will be guarded by
      validation before it can replace local state.
    </p>
  </section>
</main>
