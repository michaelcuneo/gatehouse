<script lang="ts">
  let { data } = $props();

  const base = $derived(`/p/${data.project.slug}/${data.stage.name}`);
  const date = (value: number) => new Date(value).toLocaleString();
</script>

<main class="container">
  <div class="section-head">
    <div>
      <span class="eyebrow">{data.project.name} / {data.stage.name}</span>
      <h1>Errors</h1>
      <p class="muted">{data.issues.length} grouped issues · last {data.hours}h</p>
    </div>
    <a class="pill" href={base}>Overview</a>
  </div>

  {#if data.warning}
    <section class="panel">
      <p class="error mono">{data.warning}</p>
    </section>
  {/if}

  <section class="panel">
    <div class="stage-row">
      <a class="pill" href="?hours=1">1h</a>
      <a class="pill" href="?hours=6">6h</a>
      <a class="pill" href="?hours=24">24h</a>
    </div>
  </section>

  <div class="grid">
    {#each data.issues as issue}
      <article class="panel">
        <div class="section-head" style="margin:0 0 10px">
          <div>
            <span class="eyebrow">{issue.severity} / {issue.source}</span>
            <h2>{issue.count} occurrence{issue.count === 1 ? '' : 's'}</h2>
          </div>
          <span class="pill">{date(issue.lastSeen)}</span>
        </div>

        <pre class="mono" style="white-space:pre-wrap; overflow-wrap:anywhere; margin:0">{issue.message}</pre>
        <p class="muted">First seen {date(issue.firstSeen)} · last seen {date(issue.lastSeen)}</p>
      </article>
    {/each}

    {#if !data.warning && data.issues.length === 0}
      <section class="panel">
        <h2>No warnings or errors in this window</h2>
        <p class="muted">The configured log groups did not produce any classified issues.</p>
      </section>
    {/if}
  </div>
</main>
