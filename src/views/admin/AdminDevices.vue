<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '../../components/Icon.vue'
import Modal from '../../components/Modal.vue'
import { api } from '../../lib/api'
import { pushToast, confirmDialog } from '../../lib/store'
import {
  IDENTITY_LABELS,
  DEVICE_STATUS_LABELS,
  relativeTime,
  formatDateTime
} from '../../lib/format'

const devices = ref([])
const users = ref([])
const q = ref('')
const identityFilter = ref('all')
const statusFilter = ref('all')
const loading = ref(true)
const saving = ref(false)
const detailOpen = ref(false)
const detail = ref(null)
const bindOpen = ref(false)
const bindTarget = ref(null)
const bindUserId = ref('')

const identities = [
  { value: 'unassigned', label: '未分配' },
  { value: 'teacher', label: '教师端' },
  { value: 'student', label: '学生端' },
  { value: 'display', label: '班级大屏' },
  { value: 'guest', label: '访客' }
]

const statuses = [
  { value: 'pending', label: '待绑定' },
  { value: 'bound', label: '已绑定' },
  { value: 'revoked', label: '已停用' }
]

let searchTimer = null

const filtered = computed(() =>
  devices.value.filter(
    (d) =>
      (identityFilter.value === 'all' || d.identity === identityFilter.value) &&
      (statusFilter.value === 'all' || d.status === statusFilter.value)
  )
)

const onlineCount = computed(() => {
  const cutoff = Date.now() - 5 * 60 * 1000
  return devices.value.filter((d) => d.lastSeen && new Date(d.lastSeen).getTime() >= cutoff).length
})

function deviceIcon(device) {
  if (device.identity === 'display' || device.deviceType === 'display') return 'tv'
  if (device.deviceType === 'mobile' || device.deviceType === 'tablet') return 'smartphone'
  return 'laptop'
}

function identityBadge(identity) {
  return {
    teacher: 'badge-blue',
    student: 'badge-amber',
    display: 'badge-purple',
    guest: 'badge-gray',
    unassigned: 'badge-gray'
  }[identity] || 'badge-gray'
}

function statusBadge(status) {
  return { bound: 'badge-green', pending: 'badge-amber', revoked: 'badge-red' }[status] || 'badge-gray'
}

async function load() {
  loading.value = true
  try {
    const [deviceList, userList] = await Promise.all([
      api.get(`/admin/devices?q=${encodeURIComponent(q.value.trim())}`),
      api.get('/admin/users')
    ])
    devices.value = deviceList
    users.value = userList
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

watch(q, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 350)
})

async function updateDevice(device, patch, successMessage) {
  saving.value = true
  try {
    const updated = await api.patch(`/admin/devices/${device.id}`, patch)
    const idx = devices.value.findIndex((d) => d.id === device.id)
    if (idx >= 0) devices.value[idx] = updated
    pushToast(successMessage, 'success')
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

function changeIdentity(device, event) {
  const identity = event.target.value
  if (identity === device.identity) return
  updateDevice(device, { identity }, `已将设备身份设为「${IDENTITY_LABELS[identity]}」`)
}

async function changeStatus(device, event) {
  const status = event.target.value
  if (status === device.status) return
  if (status === 'revoked') {
    const ok = await confirmDialog('停用后该设备上的登录会话会立即失效，且无法再次登录。', {
      title: '停用该设备？',
      danger: true
    })
    if (!ok) {
      event.target.value = device.status
      return
    }
  }
  updateDevice(device, { status }, `设备状态已更新为「${DEVICE_STATUS_LABELS[status]}」`)
}

function openBind(device) {
  bindTarget.value = device
  bindUserId.value = device.userId ? String(device.userId) : ''
  bindOpen.value = true
}

async function saveBind() {
  if (!bindTarget.value) return
  saving.value = true
  try {
    const patch = { userId: bindUserId.value ? Number(bindUserId.value) : null }
    const updated = await api.patch(`/admin/devices/${bindTarget.value.id}`, patch)
    const idx = devices.value.findIndex((d) => d.id === updated.id)
    if (idx >= 0) devices.value[idx] = updated
    pushToast(bindUserId.value ? '设备已绑定到指定账号' : '设备已解除绑定', 'success')
    bindOpen.value = false
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function removeDevice(device) {
  const ok = await confirmDialog('删除后该设备记录将消失，下次访问会作为新设备重新识别。', {
    title: '删除设备记录？',
    danger: true
  })
  if (!ok) return
  try {
    await api.delete(`/admin/devices/${device.id}`)
    pushToast('设备记录已删除', 'info')
    await load()
  } catch (err) {
    pushToast(err.message, 'error')
  }
}

function openDetail(device) {
  detail.value = device
  detailOpen.value = true
}

onMounted(load)
</script>

<template>
  <div class="panel">
    <div class="between wrap gap-12 mb-16">
      <div>
        <div class="card-title">设备管理</div>
        <div class="card-sub">
          共 {{ devices.length }} 台设备 · {{ onlineCount }} 台 5 分钟内活跃 · 可识别系统、浏览器、IP 与屏幕
        </div>
      </div>
      <button class="btn btn-outline btn-sm" :disabled="loading" @click="load">
        <Icon name="refresh" :size="14" />刷新
      </button>
    </div>

    <div class="toolbar mb-16">
      <div class="search-box">
        <Icon name="search" :size="15" />
        <input v-model="q" class="input" placeholder="搜索设备、IP 或绑定用户" />
      </div>
      <select v-model="identityFilter" class="select filter-select">
        <option value="all">全部身份</option>
        <option v-for="i in identities" :key="i.value" :value="i.value">{{ i.label }}</option>
      </select>
      <select v-model="statusFilter" class="select filter-select">
        <option value="all">全部状态</option>
        <option v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <span class="spacer" />
      <span class="text-xs faint">设备身份由管理员统一分配</span>
    </div>

    <div v-if="loading" class="skeleton" style="height: 300px" />
    <div v-else class="table-wrap">
      <table class="data" style="min-width: 980px">
        <thead>
          <tr>
            <th>设备</th>
            <th>系统 / 浏览器</th>
            <th>登录用户</th>
            <th>设备身份</th>
            <th>状态</th>
            <th>IP</th>
            <th>最近活跃</th>
            <th style="text-align: right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in filtered" :key="device.id">
            <td>
              <div class="user-cell">
                <span class="device-row-icon" style="width: 34px; height: 34px">
                  <Icon :name="deviceIcon(device)" :size="16" />
                </span>
                <div style="min-width: 0">
                  <div class="user-cell-name truncate" style="max-width: 190px">{{ device.name || '未命名设备' }}</div>
                  <div class="user-cell-sub"><span class="code-inline">{{ device.uuid.slice(0, 14) }}</span></div>
                </div>
              </div>
            </td>
            <td>
              <div class="text-sm">{{ device.os || '未知' }}</div>
              <div class="text-xs faint">{{ device.browser }} · {{ device.screen || '—' }}</div>
            </td>
            <td>
              <div v-if="device.userName" class="text-sm">{{ device.userName }}</div>
              <div v-if="device.username" class="text-xs faint">@{{ device.username }}</div>
              <span v-if="!device.userName" class="badge badge-gray">未绑定</span>
            </td>
            <td>
              <select
                class="select inline-select"
                :value="device.identity"
                :disabled="saving"
                @change="changeIdentity(device, $event)"
              >
                <option v-for="i in identities" :key="i.value" :value="i.value">{{ i.label }}</option>
              </select>
            </td>
            <td>
              <select
                class="select inline-select"
                :value="device.status"
                :disabled="saving"
                @change="changeStatus(device, $event)"
              >
                <option v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </td>
            <td class="muted" style="font-variant-numeric: tabular-nums">{{ device.ip || '—' }}</td>
            <td class="muted nowrap">{{ relativeTime(device.lastSeen) }}</td>
            <td>
              <div class="table-actions" style="justify-content: flex-end">
                <button class="btn btn-ghost btn-icon btn-sm" title="详情" @click="openDetail(device)">
                  <Icon name="eye" :size="14" />
                </button>
                <button class="btn btn-ghost btn-icon btn-sm" title="绑定账号" @click="openBind(device)">
                  <Icon name="link" :size="14" />
                </button>
                <button class="btn btn-ghost btn-icon btn-sm" title="删除" @click="removeDevice(device)">
                  <Icon name="trash" :size="14" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="8">
              <div class="empty-block" style="padding: 36px 20px; border: none; background: transparent">
                <div class="empty-title">没有符合条件的设备</div>
                <div class="empty-desc">设备首次访问网站后会自动出现在这里。</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal :open="detailOpen" title="设备详情" size="lg" @close="detailOpen = false">
      <div v-if="detail">
        <div class="row gap-12 mb-16">
          <span class="stat-icon" style="width: 48px; height: 48px; border-radius: 14px">
            <Icon :name="deviceIcon(detail)" :size="22" />
          </span>
          <div>
            <div class="text-sm font-bold" style="font-size: 16px">{{ detail.name || '未命名设备' }}</div>
            <div class="text-xs faint">{{ detail.uuid }}</div>
          </div>
          <span class="spacer" />
          <span class="badge" :class="identityBadge(detail.identity)">{{ IDENTITY_LABELS[detail.identity] }}</span>
          <span class="badge" :class="statusBadge(detail.status)">{{ DEVICE_STATUS_LABELS[detail.status] }}</span>
        </div>
        <div class="form-grid">
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">操作系统</span><span class="text-sm">{{ detail.os || '—' }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">浏览器</span><span class="text-sm">{{ detail.browser || '—' }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">平台</span><span class="text-sm">{{ detail.platform || '—' }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">屏幕</span><span class="text-sm">{{ detail.screen || '—' }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">设备类型</span><span class="text-sm">{{ detail.deviceType || '—' }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">IP 地址</span><span class="text-sm">{{ detail.ip || '—' }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">绑定账号</span><span class="text-sm">{{ detail.userName || '未绑定' }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">首次识别</span><span class="text-sm">{{ formatDateTime(detail.createdAt) }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">绑定时间</span><span class="text-sm">{{ formatDateTime(detail.boundAt) }}</span></div>
          <div class="between" style="padding: 8px 0; border-bottom: 1px solid var(--surface-3)"><span class="text-sm muted">最近活跃</span><span class="text-sm">{{ formatDateTime(detail.lastSeen) }}</span></div>
        </div>
        <div class="field mt-16" style="margin-bottom: 0">
          <label class="label">User-Agent</label>
          <div class="hw-note" style="word-break: break-all">{{ detail.ua || '—' }}</div>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="detailOpen = false">关闭</button>
        <button class="btn btn-primary" @click="detailOpen = false; openBind(detail)">调整绑定</button>
      </template>
    </Modal>

    <Modal :open="bindOpen" title="绑定设备账号" size="sm" @close="bindOpen = false">
      <div v-if="bindTarget">
        <div class="hw-note mb-16">
          {{ bindTarget.name || bindTarget.uuid }} · {{ bindTarget.os }} · {{ bindTarget.ip }}
        </div>
        <div class="field">
          <label class="label">绑定到账号</label>
          <select v-model="bindUserId" class="select">
            <option value="">不绑定（待绑定状态）</option>
            <option v-for="u in users" :key="u.id" :value="String(u.id)">
              {{ u.name }}（{{ u.username }} · {{ u.role === 'teacher' ? '教师' : u.role === 'student' ? '学生' : u.role === 'display' ? '大屏' : '超管' }}）
            </option>
          </select>
          <div class="hint">绑定后，该设备会记录在所选账号名下；设备身份仍可单独调整。</div>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="bindOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="saveBind">保存绑定</button>
      </template>
    </Modal>
  </div>
</template>
