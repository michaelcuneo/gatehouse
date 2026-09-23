<script lang="ts">
  let { data, form } = $props();
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
                  ? date(resource.runtime.lastReconciledAt)
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

  {#if data.section.kind === 'storage_bucket' || data.section.kind === 'static_site'}
    <div class="section-head">
      <div>
        <span class="eyebrow">Desired state</span>
        <h2>
          {data.section.kind === 'storage_bucket'
            ? 'Create local storage'
            : 'Create static deployment'}
        </h2>
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
            <input id="name" name="name" required />
          </div>

          {#if data.section.kind === 'storage_bucket'}
            <div class="field">
              <label for="path">Local path</label>
              <input
                id="path"
                name="path"
                placeholder="/srv/gatehouse/storage"
                required
              />
            </div>
          {:else}
            <div class="field">
              <label for="buildDirectory">Build directory</label>
              <input
                id="buildDirectory"
                name="buildDirectory"
                placeholder="apps/site/build"
                required
              />
            </div>

            <div class="field">
              <label for="outputDirectory">Deployment directory</label>
              <input
                id="outputDirectory"
                name="outputDirectory"
                placeholder="/srv/sites/example"
                required
              />
            </div>

            <div class="field">
              <label for="endpointId">Endpoint dependency</label>
              <select id="endpointId" name="endpointId">
                <option value="">None</option>
                {#each data.endpoints as endpoint}
                  <option value={endpoint.id}>{endpoint.name}</option>
                {/each}
              </select>
            </div>

            <div class="field">
              <label for="storageId">Storage dependency</label>
              <select id="storageId" name="storageId">
                <option value="">None</option>
                {#each data.storage as storage}
                  <option value={storage.id}>{storage.name}</option>
                {/each}
              </select>
            </div>

            <label class="check-field">
              <input name="deployOnChange" type="checkbox" />
              Deploy on change
            </label>
          {/if}
        </div>

        <div class="actions">
          <button class="button" type="submit">
            {data.section.kind === 'storage_bucket'
              ? 'Create and reconcile'
              : 'Deploy static site'}
          </button>
        </div>
      </form>
    </section>
  {/if}
</main>
