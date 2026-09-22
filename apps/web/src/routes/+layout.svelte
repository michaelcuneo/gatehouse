<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';
  import './app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>GateHouse Console</title>
  <meta
    name="description"
    content="Private cross-project engineering and infrastructure operations console."
  />
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="shell">
  <header class="topbar">
    <a class="brand" href="/">GateHouse <span>/ Console</span></a>
    <div class="spacer"></div>
    <span class="eyebrow">Private operations plane</span>
  </header>

  {@render children()}
</div>
