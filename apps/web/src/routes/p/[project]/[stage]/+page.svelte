<script lang="ts">
  let { data } = $props();

  const base = `/p/${data.project.slug}/${data.stage.name}`;

  const nav = [
    ['Overview', base, true],
    ['Logs', `${base}/logs`, data.stage.capabilities.logs],
    ['Errors', `${base}/errors`, data.stage.capabilities.errors],
    ['Requests', `${base}/requests`, data.stage.capabilities.requests],
    ['Functions', `${base}/functions`, data.stage.capabilities.functions],
    ['Services', `${base}/services`, data.stage.capabilities.services],
    ['Databases', `${base}/databases`, data.stage.capabilities.databases],
    ['Queues', `${base}/queues`, data.stage.capabilities.queues],
    ['Costs', `${base}/costs`, data.stage.capabilities.costs],
    ['AI Usage', `${base}/ai`, data.stage.capabilities.aiUsage],
    ['Auth', `${base}/auth`, data.stage.capabilities.auth],
    ['Diagnostics', `${base}/diagnostics`, data.stage.capabilities.diagnostics]
  ].filter((item) => item[2]);
</script>

<main class="container">
  <div class="section-head">
    <div>
      <span class="eyebrow">{data.stage.name} / {data.stage.primaryRegion}</span>
      <h1>{data.project.name}</h1>
      <p class="muted">
        AWS account <span class="mono">{data.stage.accountId}</span>
      </p>
    </div>

    <a class="pill" href="/">
      GateHouse
    </a>
  </div>

  <div class="project-layout">
    <aside class="sidebar panel">
      <span class="eyebrow">Operations</span>
      <nav class="nav">
        {#each nav as item}
          <a href={item[1]}>{item[0]}</a>
        {/each}
      </nav>
    </aside>

    <section class="grid">
      <div class="metric-grid">
        <article class="panel metric">
          <span class="eyebrow">AWS access</span>
          <strong>{data.aws.ok ? 'Connected' : 'Unavailable'}</strong>
          <span class="muted">
            {data.stage.access.mode === 'assume-role' ? 'STS assume-role' : 'runtime credentials'}
          </span>
        </article>

        <article class="panel metric">
          <span class="eyebrow">Account</span>
          <strong class="mono">{data.aws.ok ? data.aws.identity.accountId : data.stage.accountId}</strong>
          <span class="muted">
            {data.aws.ok && data.aws.identity.matchesConfiguredAccount ? 'identity verified' : 'configured account'}
          </span>
        </article>

        <article class="panel metric">
          <span class="eyebrow">Region</span>
          <strong>{data.stage.primaryRegion}</strong>
          <span class="muted">{data.stage.additionalRegions?.length ?? 0} additional</span>
        </article>

        <article class="panel metric">
          <span class="eyebrow">Diagnostics</span>
          <strong>{data.project.diagnosticsProfile ?? 'Generic AWS'}</strong>
          <span class="muted">semantic profile</span>
        </article>
      </div>

      {#if !data.aws.ok}
        <article class="panel">
          <span class="eyebrow">AWS connection</span>
          <h2>Unable to verify stage access</h2>
          <p class="error mono">{data.aws.error}</p>
        </article>
      {/if}

      <article class="panel">
        <span class="eyebrow">Project capabilities</span>
        <h2>Available operations</h2>
        <div class="stage-row">
          {#each Object.entries(data.stage.capabilities) as [name, enabled]}
            {#if enabled}
              <span class="pill"><span class="dot"></span>{name}</span>
            {/if}
          {/each}
        </div>
      </article>
    </section>
  </div>
</main>
