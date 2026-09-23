<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';
  import './app.css';

  let { children } = $props();

  const navigation = [
    {
      label: 'GateHouse',
      items: [
        ['Dashboard', '/'],
        ['Projects', '/projects']
      ]
    },
    {
      label: 'Infrastructure',
      items: [
        ['Resources', '/infrastructure/resources'],
        ['Endpoints', '/infrastructure/endpoints'],
        ['Services', '/infrastructure/services'],
        ['Static Sites', '/infrastructure/static-sites'],
        ['DNS', '/infrastructure/dns'],
        ['Certificates', '/infrastructure/certificates'],
        ['Storage', '/infrastructure/storage']
      ]
    },
    {
      label: 'Runtime',
      items: [
        ['Reconciliation', '/runtime/reconciliation'],
        ['Providers', '/runtime/providers'],
        ['Generated Config', '/runtime/generated']
      ]
    },
    {
      label: 'Operations',
      items: [
        ['Logs', '/operations/logs'],
        ['Errors', '/operations/errors']
      ]
    }
  ];
</script>

<svelte:head>
  <title>GateHouse</title>
  <meta
    name="description"
    content="GateHouse infrastructure management, deployment and cross-project operations."
  />
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
  <aside class="app-sidebar">
    <a class="brand" href="/">GateHouse</a>

    <nav class="app-nav">
      {#each navigation as section}
        <div class="nav-section">
          <span class="eyebrow">{section.label}</span>
          {#each section.items as item}
            <a href={item[1]}>{item[0]}</a>
          {/each}
        </div>
      {/each}
    </nav>

    <div class="sidebar-footer">
      <span class="dot"></span>
      <span>Local runtime</span>
    </div>
  </aside>

  <div class="app-main">
    <header class="topbar">
      <span class="muted">Infrastructure · Deployments · Operations</span>
      <div class="spacer"></div>
      <a class="pill" href="/projects">Projects</a>
    </header>

    {@render children()}
  </div>
</div>
