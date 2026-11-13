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
const importOpen = ref(false)
const importFileInput = ref(null)
const importFileName = ref('')
const importNames = ref([])
const importPrefix = ref('stu')
const importPassword = ref('123456')
const importResult = ref(null)
const importError = ref('')
const importing = ref(false)
const readingFile = ref(false)

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
  const ok = await confirmDialog(`删除账号「${user.name}」后，其作业提交登记会被清除，已绑定设备将变为待绑定。`, {
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

function openImport() {
  importFileName.value = ''
  importNames.value = []
  importResult.value = null
  importError.value = ''
  importOpen.value = true
}

async function parseSpreadsheet(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  readingFile.value = true
  importError.value = ''
  importResult.value = null
  try {
    const { read, utils } = await import('xlsx')
    const workbook = read(await file.arrayBuffer(), { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!firstSheet) throw new Error('表格中没有工作表')
    const rows = utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' })
    let headerRow = -1
    let nameColumn = 0
    rows.slice(0, 10).forEach((row, rowIndex) => {
      const column = row.findIndex((cell) => ['姓名', '学生姓名'].includes(String(cell).trim()))
      if (column >= 0 && headerRow === -1) {
        headerRow = rowIndex
        nameColumn = column
      }
    })
    const names = rows.slice(headerRow >= 0 ? headerRow + 1 : 0)
      .map((row) => String(row[nameColumn] || '').trim())
      .filter((name) => name && !['姓名', '学生姓名'].includes(name))
    if (!names.length) throw new Error('没有识别到学生姓名，请检查第一列或“姓名”列')
    importNames.value = [...new Set(names)]
    importFileName.value = file.name
  } catch (err) {
    importNames.value = []
    importFileName.value = ''
    importError.value = err.message || '无法读取这个表格，请更换文件'
  } finally {
    readingFile.value = false
  }
}

async function importStudents() {
  if (!importNames.value.length) {
    importError.value = '请先选择包含学生姓名的表格'
    return
  }
  importing.value = true
  importError.value = ''
  try {
    importResult.value = await api.post('/admin/users/import', {
      names: importNames.value,
      prefix: importPrefix.value.trim(),
      password: importPassword.value,
      className: state.settings.className
    })
    pushToast(`成功导入 ${importResult.value.created} 名学生`, 'success')
    await load()
  } catch (err) {
    importError.value = err.message
  } finally {
    importing.value = false
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
        <button class="btn btn-outline btn-sm" @click="openImport">
          <Icon name="users" :size="15" />Excel 导入学生
        </button>
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

    <Modal :open="importOpen" title="Excel 导入学生" size="lg" @close="importOpen = false">
      <div v-if="importError" class="form-error">
        <Icon name="alert" :size="15" style="margin-top: 1px" />{{ importError }}
      </div>
      <input ref="importFileInput" type="file" accept=".xlsx,.xls,.csv" style="display: none" @change="parseSpreadsheet" />
      <button type="button" class="import-dropzone" :disabled="readingFile" @click="importFileInput.click()">
        <span class="stat-icon"><Icon :name="readingFile ? 'refresh' : 'grid'" :size="20" :class="{ spin: readingFile }" /></span>
        <span class="import-file-title">{{ importFileName || (readingFile ? '正在读取表格…' : '选择 Excel / CSV 表格') }}</span>
        <span class="import-file-desc">读取第一个工作表的“姓名”列；没有表头时读取第一列。</span>
      </button>

      <div class="form-grid mt-16">
        <div class="field" style="margin-bottom: 0">
          <label class="label">账号前缀</label>
          <input v-model="importPrefix" class="input" maxlength="12" placeholder="stu" />
          <div class="hint">自动生成 stu001、stu002……</div>
        </div>
        <div class="field" style="margin-bottom: 0">
          <label class="label">统一初始密码</label>
          <input v-model="importPassword" class="input" minlength="6" autocomplete="new-password" />
          <div class="hint">学生登录后可自行修改密码。</div>
        </div>
      </div>

      <div v-if="importNames.length && !importResult" class="import-preview">
        <div class="between mb-12">
          <span class="text-sm font-semibold">识别到 {{ importNames.length }} 名学生</span>
          <span class="text-xs faint">导入班级：{{ state.settings.className }}</span>
        </div>
        <div class="import-name-list">
          <span v-for="name in importNames" :key="name" class="badge badge-gray">{{ name }}</span>
        </div>
      </div>

      <div v-if="importResult" class="import-preview">
        <div class="notice-item" style="margin-bottom: 12px">
          <Icon name="check" :size="16" class="notice-item-icon" />
          <div>
            <div class="notice-item-title">成功导入 {{ importResult.created }} 人，跳过 {{ importResult.skipped }} 人</div>
            <div class="notice-item-content">统一初始密码：{{ importPassword }}</div>
          </div>
        </div>
        <div v-if="importResult.accounts.length" class="import-name-list">
          <span v-for="account in importResult.accounts" :key="account.username" class="badge badge-green">
            {{ account.name }} · {{ account.username }}
          </span>
        </div>
      </div>

      <template #footer>
        <button v-if="importResult" class="btn btn-primary" @click="importOpen = false">完成</button>
        <template v-else>
          <button class="btn btn-outline" @click="importOpen = false">取消</button>
          <button class="btn btn-primary" :disabled="importing || readingFile || !importNames.length" @click="importStudents">
            <Icon v-if="importing" name="refresh" :size="14" class="spin" />
            <Icon v-else name="users" :size="14" />确认导入
          </button>
        </template>
      </template>
    </Modal>
  </div>
</template>
