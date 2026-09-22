<script lang="ts">
  let { data } = $props();

  const base = `/p/${data.project.slug}/${data.stage.name}`;
  const date = (value: number) => new Date(value).toLocaleString();
</script>

<main class="container">
  <div class="section-head">
    <div>
      <span class="eyebrow">{data.project.name} / {data.stage.name}</span>
      <h1>Logs</h1>
      <p class="muted">{data.logGroups.length} CloudWatch log groups · last {data.hours}h</p>
    </div>
    <a class="pill" href={base}>Overview</a>
  </div>

  {#if data.warning}
    <section class="panel">
      <p class="error mono">{data.warning}</p>
      {#if data.logGroups.length === 0}
        <p class="muted">
          Add log-group selectors or an inline GateHouse manifest to this stage.
        </p>
      {/if}
    </section>
  {/if}

  <section class="panel">
    <div class="stage-row">
      <a class="pill" href="?hours=1">1h</a>
      <a class="pill" href="?hours=6">6h</a>
      <a class="pill" href="?hours=24">24h</a>
    </div>
  </section>

  <section class="panel">
    <div style="overflow:auto">
      <table style="width:100%; border-collapse:collapse">
        <thead>
          <tr style="text-align:left">
            <th style="padding:10px">Time</th>
            <th style="padding:10px">Level</th>
            <th style="padding:10px">Source</th>
            <th style="padding:10px">Message</th>
          </tr>
        </thead>
        <tbody>
          {#each data.events as event}
            <tr style="border-top:1px solid #242b36">
              <td class="mono muted" style="padding:10px; white-space:nowrap">{date(event.timestamp)}</td>
              <td style="padding:10px">{event.level}</td>
              <td class="mono muted" style="padding:10px">{event.logGroup ?? event.source}</td>
              <td class="mono" style="padding:10px; min-width:480px; white-space:pre-wrap">{event.message}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</main>
