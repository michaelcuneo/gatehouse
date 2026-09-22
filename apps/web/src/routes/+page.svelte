<script lang="ts">
  let { data, form } = $props();
</script>

<main class="container">
  <span class="eyebrow">Cross-project control plane</span>
  <h1>Projects</h1>
  <p class="muted">
    Register AWS-backed systems, switch between stages and inspect their operational state from one place.
  </p>

  <div class="section-head">
    <div>
      <span class="eyebrow">Managed systems</span>
      <h2>{data.projects.length} registered</h2>
    </div>
  </div>

  {#if data.projects.length}
    <div class="grid project-grid">
      {#each data.projects as project}
        <article class="panel project-card">
          <div>
            <span class="eyebrow">{project.provider}</span>
            <h2>{project.name}</h2>
            <p class="muted mono">{project.slug}</p>
          </div>

          <div class="stage-row">
            {#each project.stages as stage}
              <a class="pill" href={`/p/${project.slug}/${stage.name}`}>
                <span class="dot"></span>
                {stage.name}
                <span class="muted">{stage.primaryRegion}</span>
              </a>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <section class="panel">
      <h2>No managed projects yet</h2>
      <p class="muted">Register the first AWS project below.</p>
    </section>
  {/if}

  <div class="section-head">
    <div>
      <span class="eyebrow">Registry</span>
      <h2>Add project</h2>
    </div>
  </div>

  <section class="panel">
    {#if form?.error}
      <p class="error">{form.error}</p>
    {/if}

    <form method="POST">
      <div class="form-grid">
        <div class="field">
          <label for="name">Project name</label>
          <input id="name" name="name" placeholder="AIMirror" required />
        </div>

        <div class="field">
          <label for="slug">Slug</label>
          <input id="slug" name="slug" placeholder="aimirror" required />
        </div>

        <div class="field">
          <label for="stage">Initial stage</label>
          <input id="stage" name="stage" value="production" required />
        </div>

        <div class="field">
          <label for="region">AWS region</label>
          <input id="region" name="region" value="ap-southeast-2" required />
        </div>

        <div class="field">
          <label for="accountId">AWS account ID</label>
          <input
            id="accountId"
            name="accountId"
            inputmode="numeric"
            placeholder="123456789012"
            required
          />
        </div>

        <div class="field">
          <label for="roleArn">Read-only role ARN (cross-account only)</label>
          <input
            id="roleArn"
            name="roleArn"
            placeholder="arn:aws:iam::123456789012:role/GateHouseReadOnly"
          />
        </div>

        <div class="field">
          <label for="logGroups">CloudWatch log groups</label>
          <input
            id="logGroups"
            name="logGroups"
            placeholder="/aws/lambda/my-api, /aws/lambda/my-worker"
          />
        </div>

        <div class="field">
          <label for="diagnosticsProfile">Diagnostics profile</label>
          <input
            id="diagnosticsProfile"
            name="diagnosticsProfile"
            placeholder="aimirror"
          />
        </div>
      </div>

      <div class="actions">
        <button class="button" type="submit">Register project</button>
      </div>
    </form>
  </section>
</main>
