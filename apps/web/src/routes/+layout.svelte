<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';
  import './app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>GateHouse</title>
  <meta
    name="description"
    content="GateHouse infrastructure management, deployment and cross-project operations."
  />
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="shell">
  <header class="topbar">
    <a class="brand" href="/">GateHouse</a>
    <div class="spacer"></div>
    <span class="eyebrow">Infrastructure · Deployments · Operations</span>
  </header>

  {@render children()}
</div>
