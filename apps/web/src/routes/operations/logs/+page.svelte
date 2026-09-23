<script lang="ts">
  let { data } = $props();
</script>

<main class="container">
  <span class="eyebrow">Operations</span>
  <h1>Logs</h1>
  <p class="muted">
    CloudWatch log access is scoped by registered project and stage.
  </p>

  <div class="grid project-grid dashboard-metrics">
    {#each data.projects as project}
      {#each project.stages as stage}
        {#if stage.capabilities.logs}
          <a class="panel project-card" href={`/p/${project.slug}/${stage.name}/logs`}>
            <div>
              <span class="eyebrow">{stage.name} / {stage.primaryRegion}</span>
              <h2>{project.name}</h2>
              <p class="muted mono">{stage.accountId}</p>
            </div>
            <span class="pill">Open logs</span>
          </a>
        {/if}
      {/each}
    {/each}
  </div>

  {#if data.projects.length === 0}
    <section class="panel empty-state dashboard-metrics">
      <h2>No external projects registered</h2>
      <p class="muted">Register a project to query its CloudWatch logs.</p>
      <a class="button" href="/projects">Register project</a>
    </section>
  {/if}
</main>
