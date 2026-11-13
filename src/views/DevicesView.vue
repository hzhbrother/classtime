<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import { api } from '../lib/api'
import { state, refreshMe, pushToast, confirmDialog } from '../lib/store'
import { IDENTITY_LABELS, DEVICE_STATUS_LABELS, relativeTime, formatDateTime } from '../lib/format'

const current = ref(null)
const devices = ref([])
const loading = ref(true)
const renameOpen = ref(false)
const renameTarget = ref(null)
const renameValue = ref('')
const saving = ref(false)

const currentDevice = computed(() => current.value || state.device)
const identityBadge = computed(() => {
  const identity = currentDevice.value?.identity
  return {
    teacher: 'badge-blue',
    student: 'badge-amber',
    display: 'badge-purple',
    guest: 'badge-gray',
    unassigned: 'badge-gray'
  }[identity] || 'badge-gray'
})

function deviceIcon(device) {
  if (!device) return 'laptop'
  if (device.identity === 'display' || device.deviceType === 'display') return 'tv'
  if (device.deviceType === 'mobile') return 'smartphone'
  if (device.deviceType === 'tablet') return 'smartphone'
  return 'laptop'
}

async function load() {
  loading.value = true
  try {
    const data = await api.get('/devices/mine')
    current.value = data.current
    devices.value = data.devices
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

async function bindCurrent() {
  saving.value = true
  try {
    const data = await api.post('/devices/bind')
    pushToast('设备已绑定到当前账号', 'success')
    current.value = data.device
    await refreshMe()
    await load()
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

function openRename(device) {
  renameTarget.value = device
  renameValue.value = device.name || ''
  renameOpen.value = true
}

async function saveRename() {
  if (!renameValue.value.trim()) return
  saving.value = true
  try {
    await api.patch(`/devices/${renameTarget.value.id}`, { name: renameValue.value.trim() })
    pushToast('设备名称已更新', 'success')
    renameOpen.value = false
    await refreshMe()
    await load()
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function unbind(device) {
  const ok = await confirmDialog('解绑后该设备将恢复为「待绑定」状态，需要重新绑定才能关联账号。', {
    title: '解绑该设备？',
    danger: true
  })
  if (!ok) return
  try {
    await api.delete(`/devices/${device.id}`)
    pushToast('设备已解绑', 'info')
    await refreshMe()
    await load()
  } catch (err) {
    pushToast(err.message, 'error')
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="between wrap gap-12 mb-20">
      <div>
        <div class="section-title">设备管理</div>
        <div class="section-sub">系统自动识别设备系统、浏览器与 IP，绑定后由管理员分配设备身份。</div>
      </div>
      <button class="btn btn-outline btn-sm" :disabled="loading" @click="load">
        <Icon name="refresh" :size="14" />刷新
      </button>
    </div>

    <div v-if="loading" class="skeleton" style="height: 240px; border-radius: 22px" />

    <template v-else-if="currentDevice">
      <section class="device-hero">
        <div class="device-hero-inner">
          <div class="row gap-16" style="min-width: 0">
            <div class="device-big-icon">
              <Icon :name="deviceIcon(currentDevice)" :size="26" />
            </div>
            <div style="min-width: 0">
              <div class="row gap-8 wrap">
                <span class="device-name">{{ currentDevice.name || '当前设备' }}</span>
                <span class="badge" :class="identityBadge">{{ IDENTITY_LABELS[currentDevice.identity] || '未分配' }}</span>
                <span class="badge" :class="currentDevice.status === 'bound' ? 'badge-green' : currentDevice.status === 'revoked' ? 'badge-red' : 'badge-amber'">
                  {{ DEVICE_STATUS_LABELS[currentDevice.status] }}
                </span>
              </div>
              <div class="device-sub">
                当前设备 · 首次识于 {{ formatDateTime(currentDevice.createdAt) }} · 最近活跃 {{ relativeTime(currentDevice.lastSeen) }}
              </div>
            </div>
          </div>
          <div class="row gap-8 wrap">
            <button v-if="currentDevice.status === 'pending'" class="btn btn-sm btn-glass" :disabled="saving" @click="bindCurrent">
              <Icon name="link" :size="14" />绑定此设备
            </button>
            <button class="btn btn-sm btn-glass" @click="openRename(currentDevice)">
              <Icon name="edit" :size="14" />重命名
            </button>
            <button v-if="currentDevice.status === 'bound'" class="btn btn-sm btn-glass" @click="unbind(currentDevice)">
              <Icon name="power" :size="14" />解绑
            </button>
          </div>
        </div>

        <div class="device-info-grid">
          <div class="device-info-item">
            <div class="device-info-label">操作系统</div>
            <div class="device-info-value">{{ currentDevice.os || '未知' }}</div>
          </div>
          <div class="device-info-item">
            <div class="device-info-label">浏览器</div>
            <div class="device-info-value">{{ currentDevice.browser || '未知' }}</div>
          </div>
          <div class="device-info-item">
            <div class="device-info-label">屏幕分辨率</div>
            <div class="device-info-value">{{ currentDevice.screen || '未知' }}</div>
          </div>
          <div class="device-info-item">
            <div class="device-info-label">IP 地址</div>
            <div class="device-info-value">{{ currentDevice.ip || '未知' }}</div>
          </div>
        </div>
        <div class="text-xs" style="margin-top: 12px; color: rgba(255, 255, 255, 0.35)">
          设备标识 <span class="code-inline" style="background: rgba(255,255,255,.08); color: rgba(255,255,255,.55)">{{ currentDevice.uuid }}</span>
        </div>
      </section>

      <div class="card card-pad mt-16">
        <div class="card-head">
          <div>
            <div class="card-title">设备身份如何分配？</div>
            <div class="card-sub">设备身份由超级管理员在后台统一设置，普通账号不能自行修改。</div>
          </div>
          <Icon name="shield" :size="20" style="color: var(--primary)" />
        </div>
        <div class="row gap-16 wrap">
          <div class="row gap-10" style="flex: 1; min-width: 180px">
            <span class="stat-icon"><Icon name="link" :size="17" /></span>
            <div>
              <div class="text-sm font-semibold">1. 登录并绑定</div>
              <div class="text-xs faint">首次登录后点击「绑定此设备」</div>
            </div>
          </div>
          <div class="row gap-10" style="flex: 1; min-width: 180px">
            <span class="stat-icon blue"><Icon name="monitor" :size="17" /></span>
            <div>
              <div class="text-sm font-semibold">2. 管理员识别</div>
              <div class="text-xs faint">后台可查看系统、IP、浏览器</div>
            </div>
          </div>
          <div class="row gap-10" style="flex: 1; min-width: 180px">
            <span class="stat-icon green"><Icon name="shield" :size="17" /></span>
            <div>
              <div class="text-sm font-semibold">3. 分配身份</div>
              <div class="text-xs faint">教师端 / 学生端 / 班级大屏</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card card-pad mt-16">
        <div class="card-head">
          <div>
            <div class="card-title">我的设备</div>
            <div class="card-sub">共 {{ devices.length }} 台已绑定设备</div>
          </div>
        </div>

        <div v-if="devices.length">
          <div v-for="device in devices" :key="device.id" class="device-row">
            <div class="device-row-icon">
              <Icon :name="deviceIcon(device)" :size="18" />
            </div>
            <div style="flex: 1; min-width: 0">
              <div class="row gap-8 wrap">
                <span class="text-sm font-semibold">{{ device.name || '未命名设备' }}</span>
                <span v-if="device.uuid === currentDevice?.uuid" class="badge badge-primary" style="height: 20px; font-size: 10px">当前设备</span>
                <span class="badge" :class="device.identity === 'teacher' ? 'badge-blue' : device.identity === 'display' ? 'badge-purple' : device.identity === 'student' ? 'badge-amber' : 'badge-gray'" style="height: 20px; font-size: 10px">
                  {{ IDENTITY_LABELS[device.identity] }}
                </span>
              </div>
              <div class="text-xs faint" style="margin-top: 3px">
                {{ device.os }} · {{ device.browser }} · {{ device.screen || '—' }} · {{ device.ip }} · {{ relativeTime(device.lastSeen) }}
              </div>
            </div>
            <div class="row gap-4">
              <button class="btn btn-ghost btn-icon btn-sm" title="重命名" @click="openRename(device)">
                <Icon name="edit" :size="14" />
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" title="解绑" @click="unbind(device)">
                <Icon name="power" :size="14" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="empty-block" style="padding: 36px 20px">
          <div class="empty-icon"><Icon name="monitor" :size="24" /></div>
          <div class="empty-title">还没有绑定设备</div>
          <div class="empty-desc">点击上方「绑定此设备」，将当前设备加入你的账号。</div>
        </div>
      </div>
    </template>

    <div v-else class="empty-block">
      <div class="empty-icon"><Icon name="monitor" :size="26" /></div>
      <div class="empty-title">无法识别当前设备</div>
      <div class="empty-desc">请刷新页面后重试，或更换浏览器访问。</div>
      <button class="btn btn-primary" @click="load">重新识别</button>
    </div>

    <Modal :open="renameOpen" title="重命名设备" size="sm" @close="renameOpen = false">
      <div class="field" style="margin-bottom: 0">
        <label class="label">设备名称</label>
        <input v-model="renameValue" class="input" maxlength="40" placeholder="例如：王老师的 MacBook" />
        <div class="hint">名称仅影响展示，不会改变设备身份。</div>
      </div>
      <template #footer>
        <button class="btn btn-outline" @click="renameOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="saveRename">保存</button>
      </template>
    </Modal>
  </div>
</template>
