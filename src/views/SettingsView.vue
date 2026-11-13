<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import Avatar from '../components/Avatar.vue'
import { api } from '../lib/api'
import { state, refreshMe, logout, pushToast } from '../lib/store'
import { ROLE_LABELS, IDENTITY_LABELS, formatDateTime } from '../lib/format'

const router = useRouter()
const name = ref(state.user?.name || '')
const nameSaving = ref(false)
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const passwordSaving = ref(false)
const passwordError = ref('')

const isAdmin = state.user?.role === 'super_admin'

async function saveName() {
  if (!name.value.trim()) return
  nameSaving.value = true
  try {
    await api.patch('/auth/profile', { name: name.value.trim() })
    await refreshMe()
    pushToast('昵称已更新', 'success')
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    nameSaving.value = false
  }
}

async function savePassword() {
  passwordError.value = ''
  if (passwordForm.newPassword.length < 6) {
    passwordError.value = '新密码至少 6 位'
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirm) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  passwordSaving.value = true
  try {
    await api.patch('/auth/profile', {
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirm = ''
    pushToast('密码修改成功', 'success')
  } catch (err) {
    passwordError.value = err.message
  } finally {
    passwordSaving.value = false
  }
}

async function handleLogout() {
  await logout()
  router.push('/login')
}
</script>

<template>
  <div>
    <div class="mb-20">
      <div class="section-title">个人设置</div>
      <div class="section-sub">管理你的账号资料、密码与设备入口。</div>
    </div>

    <div class="settings-grid">
      <div class="card card-pad">
        <div class="profile-head">
          <Avatar :name="state.user?.name" :color="state.user?.color" :size="56" />
          <div>
            <div class="profile-name">{{ state.user?.name }}</div>
            <div class="profile-sub">
              @{{ state.user?.username }} · {{ ROLE_LABELS[state.user?.role] }} · {{ state.user?.className }}
            </div>
          </div>
        </div>

        <div class="field">
          <label class="label">昵称</label>
          <div class="row gap-8">
            <input v-model="name" class="input" maxlength="20" placeholder="你的名字" />
            <button class="btn btn-primary" :disabled="nameSaving || name === state.user?.name" @click="saveName">
              保存
            </button>
          </div>
          <div class="hint">昵称会显示在作业提交登记与设备列表中。</div>
        </div>

        <div class="form-grid">
          <div class="field" style="margin-bottom: 0">
            <label class="label">账号</label>
            <input class="input" :value="state.user?.username" disabled />
          </div>
          <div class="field" style="margin-bottom: 0">
            <label class="label">身份</label>
            <input class="input" :value="ROLE_LABELS[state.user?.role]" disabled />
          </div>
        </div>
      </div>

      <div class="card card-pad">
        <div class="card-head">
          <div>
            <div class="card-title">修改密码</div>
            <div class="card-sub">建议定期更换密码，保护班级数据安全。</div>
          </div>
          <span class="stat-icon"><Icon name="lock" :size="18" /></span>
        </div>

        <form @submit.prevent="savePassword">
          <div v-if="passwordError" class="form-error">
            <Icon name="alert" :size="15" style="margin-top: 1px" />{{ passwordError }}
          </div>
          <div class="field">
            <label class="label">当前密码</label>
            <input v-model="passwordForm.oldPassword" type="password" class="input" autocomplete="current-password" />
          </div>
          <div class="field">
            <label class="label">新密码</label>
            <input v-model="passwordForm.newPassword" type="password" class="input" autocomplete="new-password" placeholder="至少 6 位" />
          </div>
          <div class="field">
            <label class="label">确认新密码</label>
            <input v-model="passwordForm.confirm" type="password" class="input" autocomplete="new-password" />
          </div>
          <button class="btn btn-primary" type="submit" :disabled="passwordSaving">
            <Icon name="lock" :size="15" />更新密码
          </button>
        </form>
      </div>

      <div class="card card-pad">
        <div class="card-head">
          <div>
            <div class="card-title">多端入口</div>
            <div class="card-sub">在不同设备上打开同一份云端作业板。</div>
          </div>
        </div>
        <a class="link-row" href="/display" target="_blank" rel="noopener">
          <span class="stat-icon purple" style="background: #f5f3ff; color: #7c3aed"><Icon name="tv" :size="17" /></span>
          <div style="flex: 1">
            <div class="text-sm font-semibold">班级大屏端</div>
            <div class="text-xs faint">适合教室一体机 / 电视，沉浸式作业展示</div>
          </div>
          <Icon name="arrowRight" :size="16" style="color: var(--faint)" />
        </a>
        <button class="link-row" style="width: 100%; text-align: left" @click="router.push('/devices')">
          <span class="stat-icon"><Icon name="monitor" :size="17" /></span>
          <div style="flex: 1">
            <div class="text-sm font-semibold">设备管理</div>
            <div class="text-xs faint">
              当前身份：{{ IDENTITY_LABELS[state.device?.identity] || '未分配' }} · {{ state.device?.os || '未知系统' }}
            </div>
          </div>
          <Icon name="arrowRight" :size="16" style="color: var(--faint)" />
        </button>
        <button v-if="isAdmin" class="link-row" style="width: 100%; text-align: left" @click="router.push('/admin')">
          <span class="stat-icon pink" style="background: #fdf2f8; color: #db2777"><Icon name="shield" :size="17" /></span>
          <div style="flex: 1">
            <div class="text-sm font-semibold">超级管理员后台</div>
            <div class="text-xs faint">用户、设备、作业、公告与系统设置</div>
          </div>
          <Icon name="arrowRight" :size="16" style="color: var(--faint)" />
        </button>
      </div>

      <div class="card card-pad">
        <div class="card-head">
          <div>
            <div class="card-title">系统信息</div>
            <div class="card-sub">当前班级空间的运行参数。</div>
          </div>
          <span class="stat-icon green"><Icon name="database" :size="18" /></span>
        </div>
        <div class="between" style="padding: 9px 0; border-bottom: 1px solid var(--surface-3)">
          <span class="text-sm muted">班级</span><span class="text-sm font-semibold">{{ state.settings.className }}</span>
        </div>
        <div class="between" style="padding: 9px 0; border-bottom: 1px solid var(--surface-3)">
          <span class="text-sm muted">每日自动更新</span><span class="text-sm font-semibold">每天 {{ state.settings.rolloverTime }}</span>
        </div>
        <div class="between" style="padding: 9px 0; border-bottom: 1px solid var(--surface-3)">
          <span class="text-sm muted">云端同步间隔</span><span class="text-sm font-semibold">{{ state.settings.autoSyncSeconds }} 秒</span>
        </div>
        <div class="between" style="padding: 9px 0; border-bottom: 1px solid var(--surface-3)">
          <span class="text-sm muted">账号创建时间</span><span class="text-sm">{{ formatDateTime(state.user?.createdAt) }}</span>
        </div>
        <div class="between" style="padding: 9px 0">
          <span class="text-sm muted">最近登录</span><span class="text-sm">{{ formatDateTime(state.user?.lastLoginAt) }}</span>
        </div>
        <button class="btn btn-danger btn-block mt-12" @click="handleLogout">
          <Icon name="logout" :size="15" />退出登录
        </button>
      </div>
    </div>
  </div>
</template>
