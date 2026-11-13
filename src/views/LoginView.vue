<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import { state, login, logout, pushToast } from '../lib/store'

const router = useRouter()
const route = useRoute()

const form = reactive({ username: '', password: '' })
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)

const adminMode = computed(() => route.query.admin === '1')

const demoAccounts = [
  { role: '超级管理员', account: 'admin', password: 'admin123', color: '#4f46e5', initial: '管' },
  { role: '班主任', account: 'teacher', password: 'teacher123', color: '#0891b2', initial: '师' },
  { role: '学生', account: 'student', password: 'student123', color: '#f59e0b', initial: '生' },
  { role: '班级大屏', account: 'display', password: 'display123', color: '#7c3aed', initial: '屏' }
]

const previewItems = [
  { subject: '数学', content: '练习册 3.2 节 1-12 题', color: '#3b82f6', initial: '数' },
  { subject: '英语', content: 'Unit 4 单词 + 阅读两篇', color: '#8b5cf6', initial: '英' },
  { subject: '物理', content: '实验报告：伏安特性曲线', color: '#f59e0b', initial: '物' }
]

const demoList = computed(() =>
  adminMode.value ? demoAccounts.filter((item) => item.account === 'admin') : demoAccounts
)

async function submit() {
  if (!form.username.trim() || !form.password) {
    error.value = '请输入账号和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const data = await login(form.username.trim(), form.password)
    if (adminMode.value) {
      if (data.user.role !== 'super_admin') {
        await logout()
        error.value = '该账号没有管理后台权限，请使用超级管理员账号登录'
        return
      }
      pushToast(`欢迎回来，${data.user.name}`, 'success')
      router.replace('/admin')
      return
    }
    pushToast(`欢迎回来，${data.user.name}`, 'success')
    if (route.query.redirect) router.replace(String(route.query.redirect))
    else if (data.user.role === 'display') router.replace('/display')
    else router.replace('/')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function quickLogin(account, password) {
  form.username = account
  form.password = password
  await submit()
}
</script>

<template>
  <div class="auth-page">
    <section class="auth-brand">
      <div class="auth-brand-content">
        <div class="brand">
          <div class="brand-mark">
            <Icon name="book" :size="20" />
          </div>
          <div>
            <div class="brand-name">{{ state.settings.siteName }}</div>
            <div class="brand-sub">CLASSBOARD CLOUD</div>
          </div>
        </div>

        <h1 class="auth-headline">
          <template v-if="adminMode">
            班级运行数据<br />
            <em>尽在掌握。</em>
          </template>
          <template v-else>
            让每一天的作业<br />
            <em>清清楚楚，准时到达。</em>
          </template>
        </h1>
        <p class="auth-lead">
          <template v-if="adminMode">
            管理员专属入口。登录后可管理账号、设备、每日作业、公告与系统设置，
            并查看班级运行数据与操作日志。
          </template>
          <template v-else>
            面向班级的云端作业板。老师随时发布，大屏实时展示，学生自助打卡，
            每日零点自动更新，多端数据始终同步。
          </template>
        </p>

        <div class="auth-features">
          <div class="auth-feature">
            <span class="auth-feature-icon"><Icon name="refresh" :size="15" /></span>
            <span>每日自动更新作业板 · 无需手动建板</span>
          </div>
          <div class="auth-feature">
            <span class="auth-feature-icon"><Icon name="monitor" :size="15" /></span>
            <span>手机、电脑、班级大屏三端实时同步</span>
          </div>
          <div class="auth-feature">
            <span class="auth-feature-icon"><Icon name="shield" :size="15" /></span>
            <span>设备识别与绑定 · 超级管理员统一管控</span>
          </div>
        </div>

        <div class="auth-preview">
          <div class="between" style="padding: 0 4px 8px">
            <span style="font-size: 11px; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.5)">今日作业 · LIVE</span>
            <span class="badge badge-dark" style="height: 20px; font-size: 10px">实时同步</span>
          </div>
          <div v-for="item in previewItems" :key="item.subject" class="auth-preview-row">
            <span class="auth-preview-dot" :style="{ background: item.color }">{{ item.initial }}</span>
            <div style="min-width: 0; flex: 1">
              <div class="auth-preview-title">{{ item.subject }} · {{ state.settings.className }}</div>
              <div class="auth-preview-sub">{{ item.content }}</div>
            </div>
            <Icon name="check" :size="15" style="color: rgba(255, 255, 255, 0.35)" />
          </div>
        </div>
      </div>
    </section>

    <section class="auth-panel">
      <div class="auth-card">
        <div class="auth-mobile-brand">
          <div class="brand-mark">
            <Icon name="book" :size="18" />
          </div>
          <div>
            <div class="brand-name">{{ state.settings.siteName }}</div>
            <div class="brand-sub">CLASSBOARD CLOUD</div>
          </div>
        </div>

        <div v-if="adminMode" class="auth-admin-tag">
          <Icon name="shield" :size="14" />管理员安全入口
        </div>
        <h2 class="auth-card-title">{{ adminMode ? '管理员登录' : '登录班级空间' }}</h2>
        <p class="auth-card-sub">
          {{ adminMode ? '仅超级管理员账号可进入管理后台。' : '使用老师或管理员分配的账号登录，也可以自助注册。' }}
        </p>

        <form class="auth-form" @submit.prevent="submit">
          <div v-if="error" class="form-error">
            <Icon name="alert" :size="15" style="margin-top: 1px; flex: none" />
            <span>{{ error }}</span>
          </div>

          <div class="field">
            <label class="label" for="username">账号</label>
            <input
              id="username"
              v-model="form.username"
              class="input"
              autocomplete="username"
              placeholder="请输入账号"
            />
          </div>

          <div class="field">
            <label class="label" for="password">密码</label>
            <div style="position: relative">
              <input
                id="password"
                v-model="form.password"
                class="input"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入密码"
                style="padding-right: 42px"
              />
              <button
                type="button"
                class="btn btn-ghost btn-icon btn-sm"
                style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%)"
                @click="showPassword = !showPassword"
              >
                <Icon :name="showPassword ? 'eye' : 'lock'" :size="15" />
              </button>
            </div>
          </div>

          <button class="btn btn-primary btn-lg btn-block" type="submit" :disabled="loading">
            <Icon v-if="loading" name="refresh" :size="16" class="spin" />
            {{ loading ? '正在登录…' : adminMode ? '进入管理后台' : '登录' }}
          </button>
        </form>

        <div class="auth-switch">
          <template v-if="adminMode">
            <router-link to="/login">返回普通登录</router-link>
          </template>
          <template v-else>
            还没有账号？<router-link to="/register">自助注册</router-link>
            <span style="opacity: 0.4; margin: 0 6px">·</span>
            <router-link :to="{ path: '/login', query: { admin: '1' } }">管理员入口</router-link>
          </template>
        </div>

        <div class="demo-accounts">
          <div class="demo-accounts-title">{{ adminMode ? '管理员演示账号' : '演示账号 · 一键登录' }}</div>
          <div class="demo-grid">
            <button
              v-for="item in demoList"
              :key="item.account"
              class="demo-btn"
              type="button"
              :disabled="loading"
              @click="quickLogin(item.account, item.password)"
            >
              <span class="demo-btn-dot" :style="{ background: item.color }">{{ item.initial }}</span>
              <span style="min-width: 0">
                <span class="demo-btn-role">{{ item.role }}</span>
                <span class="demo-btn-account">{{ item.account }} / {{ item.password }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
