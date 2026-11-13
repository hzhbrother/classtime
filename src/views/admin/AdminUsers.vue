<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Icon from '../../components/Icon.vue'
import Avatar from '../../components/Avatar.vue'
import Modal from '../../components/Modal.vue'
import { api } from '../../lib/api'
import { pushToast, confirmDialog, state } from '../../lib/store'
import { ROLE_LABELS, relativeTime, formatDateTime } from '../../lib/format'

const users = ref([])
const loading = ref(true)
const q = ref('')
const modalOpen = ref(false)
const editing = ref(null)
const saving = ref(false)
const error = ref('')
const form = reactive({ username: '', name: '', role: 'student', className: '', password: '' })

const roleBadges = {
  super_admin: 'badge-purple',
  teacher: 'badge-blue',
  student: 'badge-amber',
  display: 'badge-gray'
}

let searchTimer = null

async function load() {
  loading.value = true
  try {
    users.value = await api.get(`/admin/users?q=${encodeURIComponent(q.value.trim())}`)
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

function openCreate() {
  editing.value = null
  Object.assign(form, {
    username: '',
    name: '',
    role: 'student',
    className: state.settings.className,
    password: ''
  })
  error.value = ''
  modalOpen.value = true
}

function openEdit(user) {
  editing.value = user
  Object.assign(form, {
    username: user.username,
    name: user.name,
    role: user.role,
    className: user.className || '',
    password: ''
  })
  error.value = ''
  modalOpen.value = true
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    if (editing.value) {
      await api.patch(`/admin/users/${editing.value.id}`, {
        name: form.name.trim(),
        role: form.role,
        className: form.className.trim(),
        ...(form.password ? { password: form.password } : {})
      })
      pushToast('账号信息已更新', 'success')
    } else {
      await api.post('/admin/users', {
        username: form.username.trim(),
        name: form.name.trim(),
        role: form.role,
        className: form.className.trim(),
        password: form.password
      })
      pushToast('账号创建成功', 'success')
    }
    modalOpen.value = false
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function toggleDisabled(user) {
  const target = !user.disabled
  const ok = await confirmDialog(target ? `停用后「${user.name}」将立即退出所有设备。` : `恢复「${user.name}」的登录权限？`, {
    title: target ? '停用账号？' : '启用账号？',
    danger: target
  })
  if (!ok) return
  try {
    await api.patch(`/admin/users/${user.id}`, { disabled: target })
    pushToast(target ? '账号已停用' : '账号已启用', 'info')
    await load()
  } catch (err) {
    pushToast(err.message, 'error')
  }
}

async function remove(user) {
  const ok = await confirmDialog(`删除账号「${user.name}」后，其打卡记录会被清除，已绑定设备将变为待绑定。`, {
    title: '删除账号？',
    danger: true
  })
  if (!ok) return
  try {
    await api.delete(`/admin/users/${user.id}`)
    pushToast('账号已删除', 'info')
    await load()
  } catch (err) {
    pushToast(err.message, 'error')
  }
}

const summary = computed(() => ({
  total: users.value.length,
  students: users.value.filter((u) => u.role === 'student').length,
  teachers: users.value.filter((u) => ['teacher', 'super_admin'].includes(u.role)).length
}))

onMounted(load)
</script>

<template>
  <div class="panel">
    <div class="between wrap gap-12 mb-16">
      <div>
        <div class="card-title">用户管理</div>
        <div class="card-sub">共 {{ summary.total }} 个账号 · {{ summary.students }} 名学生 · {{ summary.teachers }} 名教师</div>
      </div>
      <div class="toolbar">
        <div class="search-box">
          <Icon name="search" :size="15" />
          <input v-model="q" class="input" placeholder="搜索账号或昵称" />
        </div>
        <button class="btn btn-primary btn-sm" @click="openCreate">
          <Icon name="plus" :size="15" />创建账号
        </button>
      </div>
    </div>

    <div v-if="loading" class="skeleton" style="height: 300px" />
    <div v-else class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>用户</th>
            <th>角色</th>
            <th>班级</th>
            <th>设备</th>
            <th>最近登录</th>
            <th>状态</th>
            <th style="text-align: right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>
              <div class="user-cell">
                <Avatar :name="user.name" :color="user.color" :size="32" />
                <div>
                  <div class="user-cell-name">{{ user.name }}</div>
                  <div class="user-cell-sub">@{{ user.username }}</div>
                </div>
              </div>
            </td>
            <td><span class="badge" :class="roleBadges[user.role]">{{ ROLE_LABELS[user.role] }}</span></td>
            <td class="muted">{{ user.className || '—' }}</td>
            <td>
              <span class="badge badge-gray">{{ user.deviceCount }} 台</span>
            </td>
            <td class="muted">{{ user.lastLoginAt ? relativeTime(user.lastLoginAt) : '从未登录' }}</td>
            <td>
              <span class="badge" :class="user.disabled ? 'badge-red' : 'badge-green'">
                <span class="dot" />{{ user.disabled ? '已停用' : '正常' }}
              </span>
            </td>
            <td>
              <div class="table-actions" style="justify-content: flex-end">
                <button class="btn btn-ghost btn-icon btn-sm" title="编辑" @click="openEdit(user)">
                  <Icon name="edit" :size="14" />
                </button>
                <button
                  class="btn btn-ghost btn-icon btn-sm"
                  :title="user.disabled ? '启用' : '停用'"
                  @click="toggleDisabled(user)"
                >
                  <Icon name="power" :size="14" />
                </button>
                <button class="btn btn-ghost btn-icon btn-sm" title="删除" @click="remove(user)">
                  <Icon name="trash" :size="14" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!users.length">
            <td colspan="7">
              <div class="empty-block" style="padding: 36px 20px; border: none; background: transparent">
                <div class="empty-title">没有找到账号</div>
                <div class="empty-desc">换个关键词，或创建新的账号。</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal :open="modalOpen" :title="editing ? '编辑账号' : '创建账号'" @close="modalOpen = false">
      <form @submit.prevent="save">
        <div v-if="error" class="form-error">
          <Icon name="alert" :size="15" style="margin-top: 1px" />{{ error }}
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="label">账号</label>
            <input v-model="form.username" class="input" :disabled="!!editing" placeholder="3-20 位字母/数字" />
          </div>
          <div class="field">
            <label class="label">昵称</label>
            <input v-model="form.name" class="input" placeholder="真实姓名或昵称" />
          </div>
          <div class="field">
            <label class="label">角色</label>
            <select v-model="form.role" class="select">
              <option value="student">学生</option>
              <option value="teacher">教师</option>
              <option value="display">班级大屏</option>
              <option value="super_admin">超级管理员</option>
            </select>
          </div>
          <div class="field">
            <label class="label">班级</label>
            <input v-model="form.className" class="input" placeholder="例如：高二(3)班" />
          </div>
        </div>
        <div class="field" style="margin-bottom: 0">
          <label class="label">{{ editing ? '重置密码（留空不修改）' : '初始密码' }}</label>
          <input v-model="form.password" type="password" class="input" placeholder="至少 6 位" autocomplete="new-password" />
          <div class="hint">账号与密码请通过线下渠道告知学生，提醒其登录后修改。</div>
        </div>
        <div v-if="editing" class="text-xs faint mt-12">
          创建于 {{ formatDateTime(editing.createdAt) }}
        </div>
      </form>
      <template #footer>
        <button class="btn btn-outline" @click="modalOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="save">
          <Icon v-if="saving" name="refresh" :size="15" class="spin" />{{ editing ? '保存修改' : '创建账号' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
