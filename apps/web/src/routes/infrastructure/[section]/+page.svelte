<script lang="ts">
  let { data, form } = $props();
  let storageProvider = $state('local');
  let staticDeploymentTarget = $state('local');
  let cloudFrontEnabled = $state(false);
  let dnsMode = $state('value');
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

  {#if data.section.kind === 'certificate' || data.section.kind === 'dns_record' || data.section.kind === 'service' || data.section.kind === 'storage_bucket' || data.section.kind === 'database_table' || data.section.kind === 'static_site'}
    <div class="section-head">
      <div>
        <span class="eyebrow">Desired state</span>
        <h2>
          {data.section.kind === 'certificate'
            ? 'Create ACM certificate'
            : data.section.kind === 'dns_record'
              ? 'Create Route53 record'
            : data.section.kind === 'service'
              ? 'Create managed service'
              : data.section.kind === 'storage_bucket'
                ? 'Create storage'
                : data.section.kind === 'database_table'
                  ? 'Create DynamoDB table'
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

          {#if data.section.kind === 'certificate'}
            <div class="field">
              <label for="stageId">Project stage</label>
              <select id="stageId" name="stageId" required>
                <option value="">Select target stage</option>
                {#each data.projectStages as stage}
                  <option value={stage.stageId}>
                    {stage.label} · {stage.accountId} · {stage.region}
                  </option>
                {/each}
              </select>
            </div>

            <div class="field">
              <label for="domains">Domains</label>
              <input
                id="domains"
                name="domains"
                placeholder="example.com, www.example.com"
                required
              />
            </div>

            <label class="check-field">
              <input name="wildcard" type="checkbox" />
              Include wildcard for the primary domain
            </label>

            <div class="field">
              <label for="region">ACM region</label>
              <input
                id="region"
                name="region"
                value="us-east-1"
                required
              />
            </div>

            <div class="field">
              <label for="validation">Validation</label>
              <select id="validation" name="validation">
                <option value="dns">Route53 DNS</option>
                <option value="email">Email</option>
              </select>
            </div>

            <div class="field">
              <label for="certificateArn">Existing certificate ARN</label>
              <input
                id="certificateArn"
                name="certificateArn"
                placeholder="Leave blank for GateHouse-managed ACM"
              />
            </div>
          {:else if data.section.kind === 'dns_record'}
            <div class="field">
              <label for="stageId">Project stage</label>
              <select id="stageId" name="stageId" required>
                <option value="">Select target stage</option>
                {#each data.projectStages as stage}
                  <option value={stage.stageId}>
                    {stage.label} · {stage.accountId} · {stage.region}
                  </option>
                {/each}
              </select>
            </div>

            <div class="field">
              <label for="dnsMode">DNS mode</label>
              <select
                id="dnsMode"
                name="dnsMode"
                bind:value={dnsMode}
              >
                <option value="value">Value record</option>
                <option value="cloudfront_alias">CloudFront alias</option>
              </select>
            </div>

            <div class="field">
              <label for="zone">Hosted zone</label>
              <input
                id="zone"
                name="zone"
                placeholder="example.com"
                required
              />
            </div>

            <div class="field">
              <label for="recordName">Record name</label>
              <input
                id="recordName"
                name="recordName"
                placeholder="www.example.com"
                required
              />
            </div>

            {#if dnsMode === 'cloudfront_alias'}
              <div class="field">
                <label for="staticSiteId">CloudFront static site</label>
                <select id="staticSiteId" name="staticSiteId" required>
                  <option value="">Select static site</option>
                  {#each data.staticSites.filter((site) => site.provider === 's3' && site.cloudFrontEnabled) as site}
                    <option value={site.id}>{site.name}</option>
                  {/each}
                </select>
              </div>
            {:else}
              <div class="field">
                <label for="recordType">Record type</label>
                <select id="recordType" name="recordType">
                  <option value="A">A</option>
                  <option value="AAAA">AAAA</option>
                  <option value="CNAME">CNAME</option>
                  <option value="TXT">TXT</option>
                </select>
              </div>

              <div class="field">
                <label for="value">Record value</label>
                <input id="value" name="value" required />
              </div>

              <div class="field">
                <label for="ttl">TTL</label>
                <input
                  id="ttl"
                  name="ttl"
                  type="number"
                  min="1"
                  value="300"
                  required
                />
              </div>
            {/if}
          {:else if data.section.kind === 'service'}
            <div class="field">
              <label for="runtime">Runtime</label>
              <select id="runtime" name="runtime">
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
                placeholder="apps/api"
                required
              />
            </div>

            <div class="field">
              <label for="startCommand">Start command</label>
              <input
                id="startCommand"
                name="startCommand"
                placeholder="pnpm start"
                required
              />
            </div>

            <div class="field">
              <label for="envFile">Environment file</label>
              <input
                id="envFile"
                name="envFile"
                placeholder=".env"
              />
            </div>

            <div class="field">
              <label for="portName">Port name</label>
              <input id="portName" name="portName" value="http" />
            </div>

            <div class="field">
              <label for="port">Port</label>
              <input
                id="port"
                name="port"
                type="number"
                min="1"
                max="65535"
                placeholder="3000"
                required
              />
            </div>

            <div class="field">
              <label for="protocol">Protocol</label>
              <select id="protocol" name="protocol">
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
                value="60"
              />
            </div>

            <label class="check-field">
              <input name="autoStart" type="checkbox" checked />
              Start automatically
            </label>
          {:else if data.section.kind === 'storage_bucket'}
            <div class="field">
              <label for="storageProvider">Storage provider</label>
              <select
                id="storageProvider"
                name="storageProvider"
                bind:value={storageProvider}
              >
                <option value="local">Local filesystem</option>
                <option value="s3">AWS S3</option>
              </select>
            </div>

            {#if storageProvider === 'local'}
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
                <label for="stageId">Project stage</label>
                <select id="stageId" name="stageId" required>
                  <option value="">Select target stage</option>
                  {#each data.projectStages as stage}
                    <option value={stage.stageId}>
                      {stage.label} · {stage.accountId} · {stage.region}
                    </option>
                  {/each}
                </select>
              </div>

              <div class="field">
                <label for="bucket">Bucket name</label>
                <input
                  id="bucket"
                  name="bucket"
                  placeholder="my-gatehouse-bucket"
                  required
                />
              </div>

              <div class="field">
                <label for="region">Region</label>
                <input
                  id="region"
                  name="region"
                  placeholder="Uses the selected stage region"
                />
              </div>

              <label class="check-field">
                <input name="public" type="checkbox" />
                Allow public access configuration
              </label>
            {/if}
          {:else if data.section.kind === 'database_table'}
            <div class="field">
              <label for="stageId">Project stage</label>
              <select id="stageId" name="stageId" required>
                <option value="">Select target stage</option>
                {#each data.projectStages as stage}
                  <option value={stage.stageId}>
                    {stage.label} · {stage.accountId} · {stage.region}
                  </option>
                {/each}
              </select>
            </div>

            <div class="field">
              <label for="tableName">Table name</label>
              <input id="tableName" name="tableName" required />
            </div>

            <div class="field">
              <label for="region">Region</label>
              <input id="region" name="region" placeholder="Uses selected stage region" />
            </div>

            <div class="field">
              <label for="partitionKeyName">Partition key</label>
              <input id="partitionKeyName" name="partitionKeyName" required />
            </div>

            <div class="field">
              <label for="partitionKeyType">Partition key type</label>
              <select id="partitionKeyType" name="partitionKeyType">
                <option value="S">String</option>
                <option value="N">Number</option>
                <option value="B">Binary</option>
              </select>
            </div>

            <div class="field">
              <label for="sortKeyName">Sort key</label>
              <input id="sortKeyName" name="sortKeyName" placeholder="Optional" />
            </div>

            <div class="field">
              <label for="sortKeyType">Sort key type</label>
              <select id="sortKeyType" name="sortKeyType">
                <option value="S">String</option>
                <option value="N">Number</option>
                <option value="B">Binary</option>
              </select>
            </div>

            <div class="field">
              <label for="billingMode">Billing mode</label>
              <select id="billingMode" name="billingMode">
                <option value="PAY_PER_REQUEST">On-demand</option>
                <option value="PROVISIONED">Provisioned</option>
              </select>
            </div>

            <div class="field">
              <label for="readCapacity">Read capacity</label>
              <input id="readCapacity" name="readCapacity" type="number" min="1" value="1" />
            </div>

            <div class="field">
              <label for="writeCapacity">Write capacity</label>
              <input id="writeCapacity" name="writeCapacity" type="number" min="1" value="1" />
            </div>

            <label class="check-field">
              <input name="deletionProtection" type="checkbox" checked />
              Enable deletion protection
            </label>
          {:else}
            <div class="field">
              <label for="deploymentTarget">Deployment target</label>
              <select
                id="deploymentTarget"
                name="deploymentTarget"
                bind:value={staticDeploymentTarget}
              >
                <option value="local">Local filesystem</option>
                <option value="s3">AWS S3</option>
              </select>
            </div>

            <div class="field">
              <label for="buildDirectory">Build directory</label>
              <input
                id="buildDirectory"
                name="buildDirectory"
                placeholder="apps/site/build"
                required
              />
            </div>

            {#if staticDeploymentTarget === 'local'}
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
                <label for="storageId">Local storage dependency</label>
                <select id="storageId" name="storageId">
                  <option value="">None</option>
                  {#each data.storage.filter((storage) => storage.provider === 'filesystem') as storage}
                    <option value={storage.id}>{storage.name}</option>
                  {/each}
                </select>
              </div>
            {:else}
              <div class="field">
                <label for="storageId">S3 storage resource</label>
                <select id="storageId" name="storageId" required>
                  <option value="">Select S3 bucket</option>
                  {#each data.storage.filter((storage) => storage.provider === 's3') as storage}
                    <option value={storage.id}>{storage.name}</option>
                  {/each}
                </select>
              </div>

              <div class="field">
                <label for="prefix">Object prefix</label>
                <input
                  id="prefix"
                  name="prefix"
                  placeholder="site/"
                />
              </div>

              <label class="check-field">
                <input
                  name="cloudFrontEnabled"
                  type="checkbox"
                  bind:checked={cloudFrontEnabled}
                />
                Deliver through CloudFront
              </label>

              {#if cloudFrontEnabled}
                <div class="field">
                  <label for="distributionId">Existing distribution ID</label>
                  <input
                    id="distributionId"
                    name="distributionId"
                    placeholder="Leave blank for GateHouse-managed CloudFront"
                  />
                </div>

                <div class="field">
                  <label for="defaultRootObject">Default root object</label>
                  <input
                    id="defaultRootObject"
                    name="defaultRootObject"
                    value="index.html"
                  />
                </div>

                <div class="field">
                  <label for="aliases">Custom hostnames</label>
                  <input
                    id="aliases"
                    name="aliases"
                    placeholder="www.example.com, example.com"
                  />
                </div>

                <div class="field">
                  <label for="certificateId">ACM certificate</label>
                  <select id="certificateId" name="certificateId">
                    <option value="">None</option>
                    {#each data.certificates.filter((certificate) => certificate.provider === 'acm') as certificate}
                      <option value={certificate.id}>{certificate.name}</option>
                    {/each}
                  </select>
                </div>
              {/if}
            {/if}

            <label class="check-field">
              <input name="deployOnChange" type="checkbox" />
              Deploy on change
            </label>
          {/if}
        </div>

        <div class="actions">
          <button class="button" type="submit">
            {data.section.kind === 'certificate'
              ? 'Create ACM certificate'
              : data.section.kind === 'dns_record'
                ? 'Create DNS record'
              : data.section.kind === 'service'
                ? 'Create service'
                : data.section.kind === 'storage_bucket'
                  ? storageProvider === 's3'
                    ? 'Create S3 bucket'
                    : 'Create local storage'
                  : staticDeploymentTarget === 's3'
                    ? cloudFrontEnabled
                      ? 'Deploy to S3 + CloudFront'
                      : 'Deploy to S3'
                    : 'Deploy static site'}
          </button>
        </div>
      </form>
    </section>
  {/if}
</main>
