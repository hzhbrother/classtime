<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from '../../components/Icon.vue'
import { api } from '../../lib/api'
import { pushToast } from '../../lib/store'
import { actionLabel, relativeTime, formatDateTime } from '../../lib/format'

const logs = ref([])
const q = ref('')
const loading = ref(true)

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase()
  if (!keyword) return logs.value
  return logs.value.filter((l) =>
    [l.username, l.detail, actionLabel(l.action), l.ip].join(' ').toLowerCase().includes(keyword)
  )
})

function badgeClass(action = '') {
  if (action.startsWith('admin.')) return 'badge-purple'
  if (action.startsWith('device.')) return 'badge-blue'
  if (action.startsWith('item.') || action.startsWith('board.')) return 'badge-primary'
  if (action.startsWith('notice.')) return 'badge-amber'
  if (action.startsWith('auth.')) return 'badge-green'
  return 'badge-gray'
}

async function load() {
  loading.value = true
  try {
    logs.value = await api.get('/admin/logs?limit=200')
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="panel">
    <div class="between wrap gap-12 mb-16">
      <div>
        <div class="card-title">操作日志</div>
        <div class="card-sub">记录登录、作业编辑、设备调整与系统设置等关键操作</div>
      </div>
      <div class="toolbar">
        <div class="search-box">
          <Icon name="search" :size="15" />
          <input v-model="q" class="input" placeholder="搜索操作人、内容或 IP" />
        </div>
        <button class="btn btn-outline btn-sm" :disabled="loading" @click="load">
          <Icon name="refresh" :size="14" />刷新
        </button>
      </div>
    </div>

    <div v-if="loading" class="skeleton" style="height: 320px" />
    <div v-else class="table-wrap">
      <table class="data" style="min-width: 860px">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作人</th>
            <th>类型</th>
            <th>详情</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in filtered" :key="log.id">
            <td class="nowrap">
              <div class="text-sm">{{ formatDateTime(log.createdAt) }}</div>
              <div class="text-xs faint">{{ relativeTime(log.createdAt) }}</div>
            </td>
            <td>
              <span v-if="log.username" class="text-sm font-semibold">{{ log.username }}</span>
              <span v-else class="badge badge-gray">系统</span>
            </td>
            <td><span class="badge" :class="badgeClass(log.action)">{{ actionLabel(log.action) }}</span></td>
            <td class="muted">{{ log.detail || '—' }}</td>
            <td class="faint" style="font-variant-numeric: tabular-nums">{{ log.ip || '—' }}</td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="5">
              <div class="empty-block" style="padding: 36px 20px; border: none; background: transparent">
                <div class="empty-title">没有匹配的日志</div>
                <div class="empty-desc">换个关键词试试。</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
