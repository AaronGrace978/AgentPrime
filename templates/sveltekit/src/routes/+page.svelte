<script lang="ts">
  let count = 0;
  
  function increment() {
    count += 1;
  }
</script>

<div class="container">
  <h1>🚀 {{projectName}}</h1>
  <p>{{description}}</p>
  
  <div class="card">
    <button on:click={increment}>
      Count is {count}
    </button>
    <p>Edit <code>src/routes/+page.svelte</code> to test HMR</p>
  </div>
  
  <p class="docs">
    Check out <a href="https://kit.svelte.dev" target="_blank">SvelteKit docs</a>
  </p>
</div>

<style>
  .card {
    padding: 2rem;
    margin: 1.5rem 0;
    background: #f8f9fa;
    border-radius: 12px;
    text-align: center;
  }
  
  code {
    background: #e9ecef;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  
  .docs {
    color: #666;
  }
  
  .docs a {
    color: #667eea;
  }
</style>
