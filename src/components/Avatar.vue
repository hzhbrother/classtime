<script setup>
import { computed } from 'vue'
import { initials } from '../lib/format'

const props = defineProps({
  name: { type: String, default: '' },
  color: { type: String, default: '#4f46e5' },
  size: { type: Number, default: 38 }
})

const text = computed(() => initials(props.name))
</script>

<template>
  <span
    class="avatar"
    :style="{ width: `${size}px`, height: `${size}px`, background: color, fontSize: `${Math.round(size * 0.4)}px` }"
  >{{ text }}</span>
</template>
