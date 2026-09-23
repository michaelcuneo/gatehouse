<script lang="ts">
  let { data } = $props();

  const date = (value: string) => new Date(value).toLocaleString();
  const size = (value: number) =>
    value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
</script>

<main class="container">
  <span class="eyebrow">Runtime</span>
  <h1>Generated Config</h1>
  <p class="muted">
    Files produced by GateHouse for runtime consumers. Certificate contents are never displayed here.
  </p>

  {#each Object.entries(data.generated) as [group, files]}
    <div class="section-head">
      <div>
        <span class="eyebrow">{group}</span>
        <h2>{files.length} files</h2>
        <p class="muted mono">{data.directories[group]}</p>
      </div>
    </div>

    <section class="panel table-panel">
      {#if files.length}
        <table class="data-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Size</th>
              <th>Modified</th>
            </tr>
          </thead>
          <tbody>
            {#each files as file}
              <tr>
                <td class="mono">{file.name}</td>
                <td>{size(file.size)}</td>
                <td class="muted">{date(file.modifiedAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="empty-state">
          <p class="muted">Nothing has been generated in this runtime directory yet.</p>
        </div>
      {/if}
    </section>
  {/each}
</main>
