<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import Avatar from '../components/Avatar.vue'
import AdminOverview from './admin/AdminOverview.vue'
import AdminUsers from './admin/AdminUsers.vue'
import AdminDevices from './admin/AdminDevices.vue'
import AdminHomework from './admin/AdminHomework.vue'
import AdminNotices from './admin/AdminNotices.vue'
import AdminSettings from './admin/AdminSettings.vue'
import AdminLogs from './admin/AdminLogs.vue'
import { state, logout } from '../lib/store'

const router = useRouter()
const section = ref('overview')

async function signOut() {
  await logout()
  router.replace({ path: '/login', query: { admin: '1' } })
}

const tabs = [
  { key: 'overview', label: '概览', icon: 'grid', desc: '今日作业、账号与设备的整体运行情况', component: AdminOverview },
  { key: 'users', label: '用户管理', icon: 'users', desc: '创建账号、调整角色与停用权限', component: AdminUsers },
  { key: 'devices', label: '设备管理', icon: 'monitor', desc: '识别设备、绑定身份与注销访问', component: AdminDevices },
  { key: 'homework', label: '作业管理', icon: 'book', desc: '维护每日作业内容与发布状态', component: AdminHomework },
  { key: 'notices', label: '公告管理', icon: 'bell', desc: '向班级各端发布与撤回公告', component: AdminNotices },
  { key: 'settings', label: '系统设置', icon: 'settings', desc: '站点信息、同步频率与注册策略', component: AdminSettings },
  { key: 'logs', label: '操作日志', icon: 'activity', desc: '查看账号、设备与内容的操作审计', component: AdminLogs }
]

const groups = computed(() => [
  { label: '工作台', items: tabs.filter((t) => t.key === 'overview') },
  { label: '账号与设备', items: tabs.filter((t) => ['users', 'devices'].includes(t.key)) },
  { label: '内容管理', items: tabs.filter((t) => ['homework', 'notices'].includes(t.key)) },
  { label: '系统', items: tabs.filter((t) => ['settings', 'logs'].includes(t.key)) }
])

const current = computed(() => tabs.find((t) => t.key === section.value) || tabs[0])
</script>

<template>
  <div class="admin-page">
    <div class="admin-console">
    <aside class="admin-rail">
      <div class="admin-rail-head">
        <span class="admin-rail-mark"><Icon name="shield" :size="18" /></span>
        <div>
          <div class="admin-rail-title">管理控制台</div>
          <div class="admin-rail-sub">{{ state.settings.className }}</div>
        </div>
      </div>

      <nav class="admin-rail-nav">
        <template v-for="group in groups" :key="group.label">
          <div class="admin-rail-group">{{ group.label }}</div>
          <button
            v-for="tab in group.items"
            :key="tab.key"
            class="admin-rail-link"
            :class="{ active: section === tab.key }"
            type="button"
            @click="section = tab.key"
          >
            <Icon :name="tab.icon" :size="17" />
            <span>{{ tab.label }}</span>
          </button>
        </template>
      </nav>

      <div class="admin-rail-foot">
        <router-link to="/" class="admin-rail-util">
          <Icon name="arrowLeft" :size="15" />返回作业板
        </router-link>
        <div class="admin-rail-user">
          <Avatar :name="state.user?.name" :color="state.user?.color" :size="32" />
          <div class="admin-rail-user-info">
            <div class="admin-rail-user-name">{{ state.user?.name }}</div>
            <div class="admin-rail-user-role">超级管理员</div>
          </div>
          <button class="admin-rail-logout" type="button" title="退出登录" @click="signOut">
            <Icon name="logout" :size="15" />
          </button>
        </div>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-head">
        <div class="admin-head-text">
          <div class="admin-crumb">管理后台 <span>/</span> {{ current.label }}</div>
          <h1 class="admin-title">{{ current.label }}</h1>
          <div class="admin-desc">{{ current.desc }}</div>
        </div>
        <div class="admin-head-actions">
          <span class="badge badge-primary admin-role-badge"><Icon name="shield" :size="12" />超级管理员</span>
          <button class="btn btn-ghost btn-icon btn-sm admin-logout" type="button" title="退出登录" @click="signOut">
            <Icon name="logout" :size="16" />
          </button>
        </div>
      </header>

      <Transition name="page" mode="out-in">
        <component :is="current.component" :key="current.key" />
      </Transition>
    </div>
    </div>
  </div>
</template>
