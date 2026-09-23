<script lang="ts">
  let { data } = $props();

  const date = (value?: string) => value ? new Date(value).toLocaleString() : 'Never';
</script>

<main class="container">
  <span class="eyebrow">Runtime</span>
  <h1>Reconciliation</h1>
  <p class="muted">
    Runtime convergence state for GateHouse-owned resources.
  </p>

  <section class="panel table-panel dashboard-metrics">
    {#if data.resources.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Kind</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Health</th>
            <th>Last reconciled</th>
            <th>Message</th>
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
              <td><span class={`status status-${resource.status}`}>{resource.status}</span></td>
              <td>
                {resource.runtime?.healthy === true
                  ? 'Healthy'
                  : resource.runtime?.healthy === false
                    ? 'Unhealthy'
                    : 'Unknown'}
              </td>
              <td class="muted">{date(resource.runtime?.lastReconciledAt)}</td>
              <td class="muted">{resource.runtime?.lastStatusMessage ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h2>No reconciliation history yet</h2>
        <p class="muted">Runtime state will appear here as managed resources reconcile.</p>
      </div>
    {/if}
  </section>

  <div class="section-head">
    <div>
      <span class="eyebrow">History</span>
      <h2>Recent resource activity</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.history.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Resource</th>
            <th>Action</th>
            <th>Result</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {#each data.history as entry}
            <tr>
              <td class="muted">{date(entry.timestamp)}</td>
              <td>
                <a href={`/infrastructure/resources/${entry.resourceId}`}>
                  <strong>{entry.resourceName}</strong>
                </a>
              </td>
              <td class="mono">{entry.action}</td>
              <td>
                <span class={entry.success ? 'status status-ready' : 'status status-error'}>
                  {entry.success ? 'success' : 'failed'}
                </span>
              </td>
              <td class="muted mono">{entry.message ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <p class="muted">No audit events have been recorded yet.</p>
      </div>
    {/if}
  </section>
</main>
