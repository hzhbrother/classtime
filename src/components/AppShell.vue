<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import { state, logout, pushToast } from '../lib/store'
import { realtime, subscribeRealtime } from '../lib/realtime'
import { ROLE_LABELS, formatDateCN, relativeTime, weekdayCN, todayStr } from '../lib/format'

const route = useRoute()
const router = useRouter()

const now = ref(new Date())
let timer = null
let unsubscribe = null

const isAdmin = computed(() => state.user?.role === 'super_admin')
const pageTitle = computed(() => route.meta.title || '作业板')
const dateLabel = computed(() => `${formatDateCN(todayStr())} ${weekdayCN(todayStr())}`)
const clock = computed(() => {
  const d = now.value
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const syncText = computed(() => {
  if (!realtime.connected) return '正在重连…'
  if (!realtime.lastEventAt) return '云端已连接'
  return `已同步 · ${relativeTime(new Date(realtime.lastEventAt).toISOString())}`
})

const desktopNav = computed(() => {
  const items = [
    { name: 'board', label: '作业板', icon: 'book' },
    { name: 'devices', label: '设备管理', icon: 'monitor' },
    { name: 'settings', label: '个人设置', icon: 'settings' }
  ]
  return items
})

const mobileNav = computed(() => {
  const items = [
    { name: 'board', label: '作业', icon: 'book' },
    { name: 'devices', label: '设备', icon: 'monitor' },
    { name: 'settings', label: '我的', icon: 'user' }
  ]
  if (isAdmin.value) items.push({ name: 'admin', label: '后台', icon: 'shield' })
  return items
})

function go(name) {
  if (route.name !== name) router.push({ name })
}

async function handleLogout() {
  await logout()
  pushToast('已安全退出登录', 'info')
  router.push({ name: 'login' })
}

onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 30000)
  unsubscribe = subscribeRealtime(() => {})
})

onBeforeUnmount(() => {
  clearInterval(timer)
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <Icon name="book" :size="20" />
        </div>
        <div>
          <div class="brand-name">{{ state.settings.siteName }}</div>
          <div class="brand-sub">CLASSBOARD · 云端同步</div>
        </div>
      </div>

      <nav class="side-nav">
        <div class="nav-section">班级空间</div>
        <button
          v-for="item in desktopNav"
          :key="item.name"
          class="nav-link"
          :class="{ active: route.name === item.name }"
          @click="go(item.name)"
        >
          <Icon :name="item.icon" :size="18" />
          <span>{{ item.label }}</span>
          <span v-if="item.name === 'devices' && state.device && state.device.status === 'pending'" class="badge badge-amber" style="margin-left: auto; height: 20px; font-size: 10px">待绑定</span>
        </button>

        <div class="nav-section">多端与系统</div>
        <a class="nav-link" href="/display" target="_blank" rel="noopener">
          <Icon name="tv" :size="18" />
          <span>班级大屏</span>
          <Icon name="arrowRight" :size="14" style="margin-left: auto; opacity: 0.5" />
        </a>
        <button v-if="isAdmin" class="nav-link" :class="{ active: route.name === 'admin' }" @click="go('admin')">
          <Icon name="shield" :size="18" />
          <span>管理后台</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="user-mini">
          <Avatar :name="state.user?.name" :color="state.user?.color" :size="34" />
          <div class="user-mini-info">
            <div class="user-mini-name">{{ state.user?.name }}</div>
            <div class="user-mini-role">{{ ROLE_LABELS[state.user?.role] }} · {{ state.settings.className }}</div>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" title="退出登录" @click="handleLogout">
            <Icon name="logout" :size="16" />
          </button>
        </div>
      </div>
    </aside>

    <div class="shell-main">
      <header class="topbar">
        <div class="mobile-brand">
          <div class="brand-mark">
            <Icon name="book" :size="16" />
          </div>
          <div>
            <div class="topbar-title">{{ pageTitle }}</div>
            <div class="topbar-date">{{ dateLabel }}</div>
          </div>
        </div>
        <div class="desktop-only">
          <div class="topbar-title">{{ pageTitle }}</div>
          <div class="topbar-date">{{ dateLabel }} · {{ clock }}</div>
        </div>

        <div class="topbar-right">
          <div class="sync-pill" :class="{ offline: !realtime.connected }" :title="syncText">
            <span class="dot" />
            <span class="desktop-only">{{ syncText }}</span>
            <span class="hidden">{{ clock }}</span>
          </div>
          <div v-if="state.device" class="device-chip">
            <Icon :name="state.device.identity === 'display' ? 'tv' : state.device.deviceType === 'mobile' ? 'smartphone' : 'laptop'" :size="14" />
            <span>{{ state.device.name || '当前设备' }}</span>
          </div>
          <button class="btn btn-ghost btn-icon" title="个人设置" @click="go('settings')">
            <Avatar :name="state.user?.name" :color="state.user?.color" :size="30" />
          </button>
        </div>
      </header>

      <main class="page">
        <slot />
      </main>

      <nav class="mobile-nav">
        <button
          v-for="item in mobileNav"
          :key="item.name"
          class="mnav-item"
          :class="{ active: route.name === item.name }"
          @click="go(item.name)"
        >
          <Icon :name="item.icon" :size="21" />
          <span>{{ item.label }}</span>
        </button>
        <a class="mnav-item" href="/display" target="_blank" rel="noopener">
          <Icon name="tv" :size="21" />
          <span>大屏</span>
        </a>
      </nav>
    </div>
  </div>
</template>
