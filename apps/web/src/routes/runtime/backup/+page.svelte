<script lang="ts">
  let { data, form } = $props();

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
  </section>

  <section class="panel">
    <span class="eyebrow">Restore validation</span>
    <h2>Inspect a backup</h2>
    <p class="muted">
      Validation parses the backup and checks the GateHouse format, version, tables,
      rows and supported columns. It does not change local state.
    </p>

    {#if form?.action === 'validate' && form?.success}
      <p class="muted mono">
        Valid GateHouse backup exported {new Date(form.exportedAt).toLocaleString()}.
      </p>
      <div class="metric-grid dashboard-metrics">
        {#each Object.entries(form.counts ?? {}) as [table, count]}
          <article class="metric">
            <strong>{count}</strong>
            <span class="muted">{labels[table] ?? table}</span>
          </article>
        {/each}
      </div>
    {/if}

    <form method="POST" action="?/validate" enctype="multipart/form-data">
      <div class="field">
        <label for="validate-backup">State backup</label>
        <input
          id="validate-backup"
          name="backup"
          type="file"
          accept="application/json,.json"
          required
        />
      </div>
      <button class="pill" type="submit">Validate backup</button>
    </form>
  </section>

  <section class="panel">
    <span class="eyebrow">Restore</span>
    <h2>Replace local GateHouse state</h2>
    <p class="muted">
      Restore pauses background reconciliation and health monitoring, writes a
      pre-restore rollback backup under data/backups, then replaces the local
      control-plane tables transactionally. It does not directly mutate AWS.
    </p>

    {#if form?.error}
      <p class="error mono">{form.error}</p>
    {:else if form?.action === 'restore' && form?.success}
      <p class="muted mono">
        Restored GateHouse state exported {new Date(form.exportedAt).toLocaleString()}.
        Pre-restore rollback backup: {form.rollbackPath}
      </p>
    {/if}

    <form method="POST" action="?/restore" enctype="multipart/form-data">
      <div class="form-grid">
        <div class="field">
          <label for="restore-backup">State backup</label>
          <input
            id="restore-backup"
            name="backup"
            type="file"
            accept="application/json,.json"
            required
          />
        </div>

        <div class="field">
          <label for="restore-confirmation">Confirmation phrase</label>
          <input
            id="restore-confirmation"
            name="confirmation"
            placeholder={data.restoreConfirmation}
            autocomplete="off"
            required
          />
          <p class="muted">
            Type exactly: <span class="mono">{data.restoreConfirmation}</span>
          </p>
        </div>
      </div>

      <button class="button" type="submit">Restore local state</button>
    </form>
  </section>
</main>
