<script lang="ts">
  let { data, form } = $props();

  const base = $derived(`/p/${data.project.slug}/${data.stage.name}`);
  const logGroups = $derived(
    (data.stage.selectors ?? [])
      .filter((selector) => selector.kind === 'log-group')
      .flatMap((selector) => selector.names ?? [])
      .join(', ')
  );

  type ProjectNavItem = {
    label: string;
    href: string;
    enabled: boolean;
  };

  const nav = $derived<ProjectNavItem[]>([
    { label: 'Overview', href: base, enabled: true },
    { label: 'Discovery', href: `${base}/discovery`, enabled: true },
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
        <span class="eyebrow">Stage settings</span>
        <h2>Configuration</h2>

        {#if form?.error}
          <p class="error mono">{form.error}</p>
        {:else if form?.action === 'updateStage' && form?.success}
          <p class="muted mono">Stage configuration saved and AWS access verified.</p>
        {/if}

        <form method="POST" action="?/update">
          <div class="form-grid">
            <div class="field">
              <label for="stageName">Stage name</label>
              <input id="stageName" name="stageName" value={data.stage.name} required />
            </div>

            <div class="field">
              <label for="accountId">AWS account ID</label>
              <input
                id="accountId"
                name="accountId"
                value={data.stage.accountId}
                inputmode="numeric"
                required
              />
              {#if data.resources.length}
                <p class="muted">Locked to this account while resources are attached.</p>
              {/if}
            </div>

            <div class="field">
              <label for="primaryRegion">Primary region</label>
              <input
                id="primaryRegion"
                name="primaryRegion"
                value={data.stage.primaryRegion}
                required
              />
            </div>

            <div class="field">
              <label for="additionalRegions">Additional regions</label>
              <input
                id="additionalRegions"
                name="additionalRegions"
                value={(data.stage.additionalRegions ?? []).join(', ')}
                placeholder="us-east-1, eu-west-1"
              />
            </div>

            <div class="field">
              <label for="accessMode">AWS access</label>
              <select id="accessMode" name="accessMode" value={data.stage.access.mode}>
                <option value="default">Runtime credentials</option>
                <option value="assume-role">STS assume-role</option>
              </select>
            </div>

            <div class="field">
              <label for="roleArn">Assume-role ARN</label>
              <input
                id="roleArn"
                name="roleArn"
                value={data.stage.access.mode === 'assume-role' ? data.stage.access.roleArn : ''}
                placeholder="arn:aws:iam::123456789012:role/GateHouse"
              />
            </div>

            <div class="field">
              <label for="externalId">External ID</label>
              <input
                id="externalId"
                name="externalId"
                value={data.stage.access.mode === 'assume-role' ? data.stage.access.externalId ?? '' : ''}
              />
            </div>

            <div class="field">
              <label for="sourceIdentity">Source identity</label>
              <input
                id="sourceIdentity"
                name="sourceIdentity"
                value={data.stage.access.mode === 'assume-role' ? data.stage.access.sourceIdentity ?? 'gatehouse' : 'gatehouse'}
              />
            </div>

            <div class="field">
              <label for="logGroups">CloudWatch log groups</label>
              <input
                id="logGroups"
                name="logGroups"
                value={logGroups}
                placeholder="/aws/lambda/api, /aws/lambda/worker"
              />
            </div>

            <div class="field">
              <label for="diagnosticsProfile">Diagnostics profile</label>
              <input
                id="diagnosticsProfile"
                name="diagnosticsProfile"
                value={data.project.diagnosticsProfile ?? ''}
              />
            </div>

            <label class="check-field">
              <input name="enabled" type="checkbox" checked={data.stage.enabled} />
              Stage enabled
            </label>
          </div>

          <div class="section-head">
            <div>
              <span class="eyebrow">Capabilities</span>
              <h3>Operational surfaces</h3>
            </div>
          </div>

          <div class="form-grid">
            {#each Object.entries(data.stage.capabilities) as [name, enabled]}
              <label class="check-field">
                <input
                  name={'capability_' + name}
                  type="checkbox"
                  checked={enabled}
                />
                {name}
              </label>
            {/each}
          </div>

          <div class="actions">
            <button class="button" type="submit">Save stage settings</button>
          </div>
        </form>
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
