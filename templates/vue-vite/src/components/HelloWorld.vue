<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ msg: string }>()

const count = ref(0)
</script>

<template>
  <div class="hello">
    <h2>{{ msg }}</h2>
    <p>{{description}}</p>
    
    <div class="card">
      <button type="button" @click="count++">Count is {{ count }}</button>
      <p>Edit <code>src/components/HelloWorld.vue</code> to test HMR</p>
    </div>
    
    <p class="docs">
      Check out 
      <a href="https://vuejs.org/guide/quick-start.html" target="_blank">Vue 3 Docs</a>
    </p>
  </div>
</template>

<style scoped>
.hello {
  padding: 2rem;
}

.card {
  padding: 2rem;
  margin: 1rem 0;
  background: rgba(66, 184, 131, 0.1);
  border-radius: 8px;
}

code {
  background: rgba(0, 0, 0, 0.1);
  padding: 0.2em 0.4em;
  border-radius: 4px;
}

.docs {
  color: #888;
}
</style>
