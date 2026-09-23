<script lang="ts">
  let { data, form } = $props();

  const date = (value?: string) => value ? new Date(value).toLocaleString() : 'Never';
</script>

<main class="container">
  <span class="eyebrow">Infrastructure / {data.resource.kind}</span>
  <h1>{data.resource.name}</h1>
  <div class="stage-row">
    <span class={`status status-${data.resource.status}`}>{data.resource.status}</span>
    <span class="pill">{data.resource.provider}</span>
    <span class="pill">v{data.resource.version}</span>

    <form method="POST" action="?/reconcile">
      <button class="pill" type="submit">Reconcile now</button>
    </form>

    <form method="POST" action="?/health">
      <button class="pill" type="submit">Check health</button>
    </form>

    <form method="POST" action="?/toggle">
      <button class="pill" type="submit">
        {data.resource.enabled ? 'Disable' : 'Enable'}
      </button>
    </form>
  </div>

  {#if form?.error}
    <p class="error mono">{form.error}</p>
  {/if}

  <div class="detail-grid dashboard-metrics">
    <section class="panel">
      <span class="eyebrow">Desired state</span>
      <h2>Resource</h2>
      <dl class="detail-list">
        <div><dt>Kind</dt><dd class="mono">{data.resource.kind}</dd></div>
        <div><dt>Provider</dt><dd>{data.resource.provider}</dd></div>
        <div><dt>Enabled</dt><dd>{data.resource.enabled ? 'Yes' : 'No'}</dd></div>
        <div><dt>Created</dt><dd>{date(data.resource.createdAt)}</dd></div>
        <div><dt>Updated</dt><dd>{date(data.resource.updatedAt)}</dd></div>
      </dl>
    </section>

    <section class="panel">
      <span class="eyebrow">Runtime state</span>
      <h2>Reconciliation</h2>
      <dl class="detail-list">
        <div><dt>Healthy</dt><dd>{data.resource.runtime?.healthy === true ? 'Yes' : data.resource.runtime?.healthy === false ? 'No' : 'Unknown'}</dd></div>
        <div><dt>Last health check</dt><dd>{date(data.resource.runtime?.lastHealthCheckAt)}</dd></div>
        <div><dt>Health message</dt><dd>{data.resource.runtime?.lastHealthMessage ?? 'No health check yet'}</dd></div>
        <div><dt>Last reconciled</dt><dd>{date(data.resource.runtime?.lastReconciledAt)}</dd></div>
        <div><dt>Status</dt><dd>{data.resource.runtime?.lastStatusMessage ?? 'No runtime status yet'}</dd></div>
      </dl>
      {#if data.resource.runtime?.lastError}
        <p class="error mono">{data.resource.runtime.lastError}</p>
      {/if}
    </section>
  </div>

  <div class="detail-grid">
    <section class="panel">
      <span class="eyebrow">Specification</span>
      <h2>Desired configuration</h2>
      <pre class="code-block">{JSON.stringify(data.resource.spec, null, 2)}</pre>
    </section>

    <section class="panel">
      <span class="eyebrow">Metadata</span>
      <h2>Resource metadata</h2>
      <pre class="code-block">{JSON.stringify(data.resource.metadata ?? {}, null, 2)}</pre>
    </section>
  </div>
</main>
