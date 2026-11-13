<script setup>
import Icon from './Icon.vue'

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  size: { type: String, default: '' }
})
const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @mousedown.self="emit('close')">
      <div class="modal" :class="size ? `modal-${size}` : ''" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div class="modal-title">{{ title }}</div>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" @click="emit('close')">
            <Icon name="x" :size="16" />
          </button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-foot">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
