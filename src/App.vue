<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './components/AppShell.vue'
import Icon from './components/Icon.vue'
import Modal from './components/Modal.vue'
import { state, resolveConfirm } from './lib/store'

const route = useRoute()
const shellLayout = computed(() => (route.meta.layout === false ? 'div' : AppShell))

const toastIcons = { success: 'check', error: 'alert', info: 'info' }
</script>

<template>
  <component :is="shellLayout">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </component>

  <Teleport to="body">
    <div class="toast-host">
      <TransitionGroup name="toast">
        <div v-for="t in state.toasts" :key="t.id" class="toast" :class="`toast-${t.type}`">
          <Icon :name="toastIcons[t.type] || 'info'" :size="17" class="toast-icon" />
          <div>
            <div v-if="t.title" class="toast-title">{{ t.title }}</div>
            <div class="toast-msg">{{ t.message }}</div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>

  <Modal
    :open="state.confirm.open"
    :title="state.confirm.title"
    size="sm"
    @close="resolveConfirm(false)"
  >
    <div class="confirm-icon" :class="{ danger: state.confirm.danger }">
      <Icon :name="state.confirm.danger ? 'alert' : 'info'" :size="22" />
    </div>
    <p class="text-sm" style="color: var(--text-2); line-height: 1.7">{{ state.confirm.message }}</p>
    <template #footer>
      <button class="btn btn-outline" @click="resolveConfirm(false)">取消</button>
      <button class="btn" :class="state.confirm.danger ? 'btn-danger' : 'btn-primary'" @click="resolveConfirm(true)">
        确认
      </button>
    </template>
  </Modal>
</template>
