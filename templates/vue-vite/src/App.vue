<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <div class="app">
    <header>
      <h1>🚀 {{projectName}}</h1>
    </header>
    <main>
      <HelloWorld msg="Welcome to Vue 3 + TypeScript + Vite" />
    </main>
  </div>
</template>

<style scoped>
.app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

header {
  margin-bottom: 2rem;
}

h1 {
  font-size: 2.5rem;
  color: #42b883;
}
</style>
