<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';
  import './app.css';

  let { children } = $props();

  type NavItem = {
    label: string;
    href: string;
  };

  type NavSection = {
    label: string;
    items: NavItem[];
  };

  const navigation: NavSection[] = [
    {
      label: 'GateHouse',
      items: [
        { label: 'Dashboard', href: '/' },
        { label: 'Projects', href: '/projects' },
        { label: 'Deployments', href: '/deployments' }
      ]
    },
    {
      label: 'Infrastructure',
      items: [
        { label: 'Resources', href: '/infrastructure/resources' },
        { label: 'Endpoints', href: '/infrastructure/endpoints' },
        { label: 'Services', href: '/infrastructure/services' },
        { label: 'Static Sites', href: '/infrastructure/static-sites' },
        { label: 'DNS', href: '/infrastructure/dns' },
        { label: 'Certificates', href: '/infrastructure/certificates' },
        { label: 'Storage', href: '/infrastructure/storage' },
        { label: 'DynamoDB', href: '/infrastructure/dynamodb' },
        { label: 'Functions', href: '/infrastructure/functions' }
      ]
    },
    {
      label: 'Runtime',
      items: [
        { label: 'Reconciliation', href: '/runtime/reconciliation' },
        { label: 'Providers', href: '/runtime/providers' },
        { label: 'Generated Config', href: '/runtime/generated' },
        { label: 'Backup', href: '/runtime/backup' }
      ]
    },
    {
      label: 'Operations',
      items: [
        { label: 'Logs', href: '/operations/logs' },
        { label: 'Errors', href: '/operations/errors' }
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
            <a href={item.href}>{item.label}</a>
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
