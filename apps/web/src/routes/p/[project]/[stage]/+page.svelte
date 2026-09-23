<script lang="ts">
  let { data } = $props();

  const base = $derived(`/p/${data.project.slug}/${data.stage.name}`);

  type ProjectNavItem = {
    label: string;
    href: string;
    enabled: boolean;
  };

  const nav = $derived<ProjectNavItem[]>([
    { label: 'Overview', href: base, enabled: true },
    { label: 'Logs', href: `${base}/logs`, enabled: data.stage.capabilities.logs },
    { label: 'Errors', href: `${base}/errors`, enabled: data.stage.capabilities.errors },
    { label: 'Requests', href: `${base}/requests`, enabled: data.stage.capabilities.requests },
    { label: 'Functions', href: `${base}/functions`, enabled: data.stage.capabilities.functions },
    { label: 'Services', href: `${base}/services`, enabled: data.stage.capabilities.services },
    { label: 'Databases', href: `${base}/databases`, enabled: data.stage.capabilities.databases },
    { label: 'Queues', href: `${base}/queues`, enabled: data.stage.capabilities.queues },
    { label: 'Costs', href: `${base}/costs`, enabled: data.stage.capabilities.costs },
    { label: 'AI Usage', href: `${base}/ai`, enabled: data.stage.capabilities.aiUsage },
    { label: 'Auth', href: `${base}/auth`, enabled: data.stage.capabilities.auth },
    { label: 'Diagnostics', href: `${base}/diagnostics`, enabled: data.stage.capabilities.diagnostics }
  ].filter((item) => item.enabled));
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
          <a href={item.href}>{item.label}</a>
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
        <span class="eyebrow">GateHouse managed</span>
        <h2>Infrastructure</h2>
        {#if data.resources.length}
          <div class="resource-list">
            {#each data.resources as resource}
              <a class="resource-row" href={`/infrastructure/resources/${resource.id}`}>
                <div>
                  <strong>{resource.name}</strong>
                  <span class="muted mono">{resource.kind} · {resource.provider}</span>
                </div>
                <span class={`status status-${resource.status}`}>{resource.status}</span>
              </a>
            {/each}
          </div>
        {:else}
          <p class="muted">No GateHouse-owned resources are attached to this stage yet.</p>
          <a class="pill" href="/infrastructure/endpoints">Create or attach infrastructure</a>
        {/if}
      </article>

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
