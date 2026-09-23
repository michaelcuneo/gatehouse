<script lang="ts">
  let { data, form } = $props();

  let mode = $state<'reverse_proxy' | 'static'>('reverse_proxy');
  const date = (value: string) => new Date(value).toLocaleString();
</script>

<main class="container">
  <span class="eyebrow">Infrastructure</span>
  <h1>Endpoints</h1>
  <p class="muted">
    NGINX routes owned by GateHouse. Creating an endpoint persists desired state and immediately reconciles the runtime.
  </p>

  <div class="section-head">
    <div>
      <span class="eyebrow">Managed routes</span>
      <h2>{data.endpoints.length} endpoints</h2>
    </div>
  </div>

  <section class="panel table-panel">
    {#if data.endpoints.length}
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Host</th>
            <th>Mode</th>
            <th>Target</th>
            <th>Status</th>
            <th>Last reconciled</th>
          </tr>
        </thead>
        <tbody>
          {#each data.endpoints as endpoint}
            <tr>
              <td><a href={`/infrastructure/resources/${endpoint.id}`}><strong>{endpoint.name}</strong></a></td>
              <td class="mono">{endpoint.spec.host}</td>
              <td>{endpoint.spec.mode === 'reverse_proxy' ? 'Reverse proxy' : 'Static'}</td>
              <td class="mono">
                {#if endpoint.spec.mode === 'reverse_proxy'}
                  {endpoint.spec.upstream.host}:{endpoint.spec.upstream.port}
                {:else}
                  {endpoint.spec.root}
                {/if}
              </td>
              <td><span class={`status status-${endpoint.status}`}>{endpoint.status}</span></td>
              <td class="muted">
                {endpoint.runtime?.lastReconciledAt
                  ? date(endpoint.runtime.lastReconciledAt as string)
                  : 'Never'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <h3>No endpoints yet</h3>
        <p class="muted">Create one below to persist and reconcile the first NGINX resource.</p>
      </div>
    {/if}
  </section>

  <div class="section-head">
    <div>
      <span class="eyebrow">Desired state</span>
      <h2>Create endpoint</h2>
    </div>
  </div>

  <section class="panel">
    {#if form?.error}
      <p class="error mono">{form.error}</p>
    {/if}

    <form method="POST" action="?/create">
      <div class="form-grid">
        <div class="field">
          <label for="name">Resource name</label>
          <input id="name" name="name" placeholder="AIMirror API" required />
        </div>

        <div class="field">
          <label for="host">Hostname</label>
          <input id="host" name="host" placeholder="api.aimirror.dev" required />
        </div>

        <div class="field">
          <label for="stageId">Project / stage</label>
          <select id="stageId" name="stageId">
            <option value="">Unassigned infrastructure</option>
            {#each data.projects as project}
              {#each project.stages as stage}
                <option value={stage.id}>{project.name} / {stage.name}</option>
              {/each}
            {/each}
          </select>
        </div>

        <div class="field">
          <label for="mode">Mode</label>
          <select id="mode" name="mode" bind:value={mode}>
            <option value="reverse_proxy">Reverse proxy</option>
            <option value="static">Static files</option>
          </select>
        </div>

        {#if mode === 'reverse_proxy'}
          <div class="field">
            <label for="upstreamHost">Upstream host</label>
            <input id="upstreamHost" name="upstreamHost" value="127.0.0.1" />
          </div>

          <div class="field">
            <label for="upstreamPort">Upstream port</label>
            <input id="upstreamPort" name="upstreamPort" type="number" min="1" max="65535" placeholder="3000" required />
          </div>

          <label class="check-field">
            <input name="websocket" type="checkbox" />
            WebSocket support
          </label>
        {:else}
          <div class="field">
            <label for="root">Filesystem root</label>
            <input id="root" name="root" placeholder="/srv/sites/app" required />
          </div>

          <label class="check-field">
            <input name="spaFallback" type="checkbox" checked />
            SPA fallback
          </label>
        {/if}

        <label class="check-field">
          <input name="redirectToHttps" type="checkbox" />
          Redirect HTTP to HTTPS
        </label>
      </div>

      <div class="actions">
        <button class="button" type="submit">Create and reconcile</button>
      </div>
    </form>
  </section>
</main>
