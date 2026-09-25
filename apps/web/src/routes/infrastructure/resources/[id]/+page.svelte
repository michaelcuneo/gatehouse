<script lang="ts">
  let { data, form } = $props();

  const date = (value?: string) => value ? new Date(value).toLocaleString() : 'Never';
  const tagValue = (data.resource.metadata?.tags ?? []).join(', ');

  let endpointMode = $state(
    data.resource.kind === 'endpoint'
      ? data.resource.spec.mode
      : 'reverse_proxy'
  );

  const currentStageId = $derived(data.stageIds[0] ?? '');
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
  {:else if form?.action === 'update' && form?.success}
    <p class="muted mono">
      Desired state saved as v{form.version}. Automatic reconciliation will converge the resource.
    </p>
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

  <div class="section-head">
    <div>
      <span class="eyebrow">Desired state</span>
      <h2>Edit resource</h2>
    </div>
  </div>

  <section class="panel">
    <form method="POST" action="?/update">
      <div class="form-grid">
        <div class="field">
          <label for="name">Resource name</label>
          <input id="name" name="name" value={data.resource.name} required />
        </div>

        <div class="field">
          <label for="description">Description</label>
          <input
            id="description"
            name="description"
            value={data.resource.metadata?.description ?? ''}
            placeholder="Optional description"
          />
        </div>

        <div class="field">
          <label for="tags">Tags</label>
          <input
            id="tags"
            name="tags"
            value={tagValue}
            placeholder="production, public, api"
          />
        </div>

        {#if data.resource.kind === 'endpoint'}
          <div class="field">
            <label for="stageId">Project / stage</label>
            <select id="stageId" name="stageId" value={currentStageId}>
              <option value="">Unassigned infrastructure</option>
              {#each data.stages as stage}
                <option value={stage.id}>{stage.label}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <label for="host">Hostname</label>
            <input id="host" name="host" value={data.resource.spec.host} required />
          </div>

          <div class="field">
            <label for="mode">Mode</label>
            <select id="mode" name="mode" bind:value={endpointMode}>
              <option value="reverse_proxy">Reverse proxy</option>
              <option value="static">Static files</option>
            </select>
          </div>

          {#if endpointMode === 'reverse_proxy'}
            <div class="field">
              <label for="upstreamHost">Upstream host</label>
              <input
                id="upstreamHost"
                name="upstreamHost"
                value={data.resource.spec.mode === 'reverse_proxy'
                  ? data.resource.spec.upstream.host
                  : '127.0.0.1'}
                required
              />
            </div>

            <div class="field">
              <label for="upstreamPort">Upstream port</label>
              <input
                id="upstreamPort"
                name="upstreamPort"
                type="number"
                min="1"
                max="65535"
                value={data.resource.spec.mode === 'reverse_proxy'
                  ? data.resource.spec.upstream.port
                  : 3000}
                required
              />
            </div>

            <label class="check-field">
              <input
                name="websocket"
                type="checkbox"
                checked={data.resource.spec.mode === 'reverse_proxy' && data.resource.spec.websocket === true}
              />
              WebSocket support
            </label>
          {:else}
            <div class="field">
              <label for="root">Filesystem root</label>
              <input
                id="root"
                name="root"
                value={data.resource.spec.mode === 'static' ? data.resource.spec.root : ''}
                required
              />
            </div>

            <label class="check-field">
              <input
                name="spaFallback"
                type="checkbox"
                checked={data.resource.spec.mode === 'static' && data.resource.spec.spaFallback === true}
              />
              SPA fallback
            </label>
          {/if}

          <label class="check-field">
            <input
              name="redirectToHttps"
              type="checkbox"
              checked={data.resource.spec.redirectToHttps === true}
            />
            Redirect HTTP to HTTPS
          </label>

        {:else if data.resource.kind === 'service'}
          <div class="field">
            <label for="runtime">Runtime</label>
            <select id="runtime" name="runtime" value={data.resource.spec.runtime}>
              <option value="node">Node</option>
              <option value="bun">Bun</option>
              <option value="python">Python</option>
              <option value="docker">Docker</option>
              <option value="binary">Binary</option>
            </select>
          </div>

          <div class="field">
            <label for="workingDirectory">Working directory</label>
            <input
              id="workingDirectory"
              name="workingDirectory"
              value={data.resource.spec.workingDirectory}
              required
            />
          </div>

          <div class="field">
            <label for="startCommand">Start command</label>
            <input
              id="startCommand"
              name="startCommand"
              value={data.resource.spec.startCommand}
              required
            />
          </div>

          <div class="field">
            <label for="envFile">Environment file</label>
            <input
              id="envFile"
              name="envFile"
              value={data.resource.spec.envFile ?? ''}
            />
          </div>

          <div class="field">
            <label for="portName">Port name</label>
            <input
              id="portName"
              name="portName"
              value={data.resource.spec.ports[0]?.name ?? 'http'}
            />
          </div>

          <div class="field">
            <label for="port">Port</label>
            <input
              id="port"
              name="port"
              type="number"
              min="1"
              max="65535"
              value={data.resource.spec.ports[0]?.port ?? 3000}
              required
            />
          </div>

          <div class="field">
            <label for="protocol">Protocol</label>
            <select
              id="protocol"
              name="protocol"
              value={data.resource.spec.ports[0]?.protocol ?? 'http'}
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="tcp">TCP</option>
            </select>
          </div>

          <div class="field">
            <label for="healthPath">Health path</label>
            <input
              id="healthPath"
              name="healthPath"
              value={data.resource.spec.healthcheck?.path ?? ''}
              placeholder="/healthz"
            />
          </div>

          <div class="field">
            <label for="healthInterval">Health interval (seconds)</label>
            <input
              id="healthInterval"
              name="healthInterval"
              type="number"
              min="10"
              value={data.resource.spec.healthcheck?.intervalSeconds ?? 60}
            />
          </div>

          <label class="check-field">
            <input
              name="autoStart"
              type="checkbox"
              checked={data.resource.spec.autoStart !== false}
            />
            Start automatically
          </label>

        {:else if data.resource.kind === 'certificate'}
          {#if data.resource.spec.provider === 'aws_acm'}
            <div class="field">
              <label>Certificate identity</label>
              <input value={data.resource.spec.certificateArn ?? data.resource.spec.domains.join(', ')} disabled />
              <p class="muted">
                Domains, ARN, region and validation method are identity-bearing and require an explicit replacement workflow.
              </p>
            </div>

            <div class="field">
              <label>Project / stage</label>
              <input
                value={data.stages.find((stage) => stage.id === currentStageId)?.label ?? 'Unassigned'}
                disabled
              />
            </div>

            <label class="check-field">
              <input
                name="autoRenew"
                type="checkbox"
                checked={data.resource.spec.autoRenew !== false}
              />
              Auto renew
            </label>
          {/if}

        {:else if data.resource.kind === 'dns_record'}
          <div class="field">
            <label>Record identity</label>
            <input
              value={`${data.resource.spec.name} · ${data.resource.spec.mode === 'cloudfront_alias' ? 'CloudFront alias' : data.resource.spec.type}`}
              disabled
            />
            <p class="muted">
              Zone, record name and record type are locked so editing cannot leave an orphaned DNS record.
            </p>
          </div>

          {#if data.resource.spec.mode === 'cloudfront_alias'}
            <div class="field">
              <label for="staticSiteId">CloudFront static site</label>
              <select
                id="staticSiteId"
                name="staticSiteId"
                value={data.resource.spec.staticSiteId}
                required
              >
                {#each data.staticSites.filter((site) => site.spec.cloudFront?.enabled === true) as site}
                  <option value={site.id}>{site.name}</option>
                {/each}
              </select>
            </div>
          {:else}
            <div class="field">
              <label for="value">Record value</label>
              <input id="value" name="value" value={data.resource.spec.value} required />
            </div>

            <div class="field">
              <label for="ttl">TTL</label>
              <input
                id="ttl"
                name="ttl"
                type="number"
                min="1"
                value={data.resource.spec.ttl ?? 300}
                required
              />
            </div>
          {/if}

        {:else if data.resource.kind === 'storage_bucket'}
          {#if data.resource.spec.provider === 's3'}
            <div class="field">
              <label>Bucket identity</label>
              <input value={data.resource.spec.bucket} disabled />
              <p class="muted">
                Bucket name and region are locked. Changing either would mean managing a different S3 resource.
              </p>
            </div>

            <div class="field">
              <label>Region</label>
              <input value={data.resource.spec.region} disabled />
            </div>

            <label class="check-field">
              <input
                name="public"
                type="checkbox"
                checked={data.resource.spec.public === true}
              />
              Allow public access configuration
            </label>
          {:else}
            <div class="field">
              <label>Filesystem path</label>
              <input value={data.resource.spec.path} disabled />
              <p class="muted">
                The managed path is identity-bearing. Moving storage requires a migration workflow rather than an edit.
              </p>
            </div>
          {/if}

        {:else if data.resource.kind === 'static_site'}
          <div class="field">
            <label for="buildDirectory">Build directory</label>
            <input
              id="buildDirectory"
              name="buildDirectory"
              value={data.resource.spec.buildDirectory}
              required
            />
          </div>

          <label class="check-field">
            <input
              name="deployOnChange"
              type="checkbox"
              checked={data.resource.spec.deployOnChange === true}
            />
            Deploy automatically when build output changes
          </label>

          {#if data.resource.provider === 'filesystem'}
            <div class="field">
              <label>Deployment directory</label>
              <input value={data.resource.spec.outputDirectory ?? ''} disabled />
              <p class="muted">
                The deployment target is locked to avoid abandoning files at an old destination.
              </p>
            </div>

            <div class="field">
              <label for="endpointId">Endpoint dependency</label>
              <select
                id="endpointId"
                name="endpointId"
                value={data.resource.spec.endpointId ?? ''}
              >
                <option value="">None</option>
                {#each data.endpoints as endpoint}
                  <option value={endpoint.id}>{endpoint.name}</option>
                {/each}
              </select>
            </div>
          {:else}
            <div class="field">
              <label>S3 target</label>
              <input
                value={data.storage.find((storage) => storage.id === data.resource.spec.storageId)?.name ?? data.resource.spec.storageId ?? 'Unknown'}
                disabled
              />
              <p class="muted">
                S3 storage and object prefix are locked until Gatehouse has an explicit migration workflow.
              </p>
            </div>

            {#if data.resource.spec.cloudFront?.enabled}
              <div class="field">
                <label for="defaultRootObject">Default root object</label>
                <input
                  id="defaultRootObject"
                  name="defaultRootObject"
                  value={data.resource.spec.cloudFront.defaultRootObject ?? 'index.html'}
                />
              </div>

              <div class="field">
                <label for="aliases">Custom hostnames</label>
                <input
                  id="aliases"
                  name="aliases"
                  value={(data.resource.spec.cloudFront.aliases ?? []).join(', ')}
                />
              </div>

              <div class="field">
                <label for="certificateId">ACM certificate</label>
                <select
                  id="certificateId"
                  name="certificateId"
                  value={data.resource.spec.cloudFront.certificateId ?? ''}
                >
                  <option value="">None</option>
                  {#each data.certificates.filter((certificate) => certificate.spec.provider === 'aws_acm') as certificate}
                    <option value={certificate.id}>{certificate.name}</option>
                  {/each}
                </select>
              </div>

              {#if data.resource.spec.cloudFront.distributionId}
                <div class="field">
                  <label>Adopted distribution</label>
                  <input value={data.resource.spec.cloudFront.distributionId} disabled />
                </div>
              {/if}
            {/if}
          {/if}
        {/if}
      </div>

      <div class="actions">
        <button class="button" type="submit">Save desired state</button>
      </div>
    </form>
  </section>

  <div class="detail-grid">
    <section class="panel">
      <span class="eyebrow">Specification</span>
      <h2>Stored configuration</h2>
      <pre class="code-block">{JSON.stringify(data.resource.spec, null, 2)}</pre>
    </section>

    <section class="panel">
      <span class="eyebrow">Metadata</span>
      <h2>Stored metadata</h2>
      <pre class="code-block">{JSON.stringify(data.resource.metadata ?? {}, null, 2)}</pre>
    </section>
  </div>
</main>
