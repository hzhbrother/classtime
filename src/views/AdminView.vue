<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import AdminOverview from './admin/AdminOverview.vue'
import AdminUsers from './admin/AdminUsers.vue'
import AdminDevices from './admin/AdminDevices.vue'
import AdminHomework from './admin/AdminHomework.vue'
import AdminNotices from './admin/AdminNotices.vue'
import AdminSettings from './admin/AdminSettings.vue'
import AdminLogs from './admin/AdminLogs.vue'
import { state } from '../lib/store'

const section = ref('overview')

const tabs = [
  { key: 'overview', label: '概览', icon: 'grid', component: AdminOverview },
  { key: 'users', label: '用户管理', icon: 'users', component: AdminUsers },
  { key: 'devices', label: '设备管理', icon: 'monitor', component: AdminDevices },
  { key: 'homework', label: '作业管理', icon: 'book', component: AdminHomework },
  { key: 'notices', label: '公告管理', icon: 'bell', component: AdminNotices },
  { key: 'settings', label: '系统设置', icon: 'settings', component: AdminSettings },
  { key: 'logs', label: '操作日志', icon: 'activity', component: AdminLogs }
]

const current = computed(() => tabs.find((t) => t.key === section.value) || tabs[0])
</script>

<template>
  <div>
    <div class="between wrap gap-12 mb-16">
      <div>
        <div class="row gap-10">
          <h1 class="section-title" style="font-size: 21px">管理后台</h1>
          <span class="badge badge-primary"><Icon name="shield" :size="12" />超级管理员</span>
        </div>
        <div class="section-sub">
          {{ state.user?.name }} · 拥有最高管理权限 · {{ state.settings.className }}
        </div>
      </div>
      <router-link to="/" class="btn btn-outline btn-sm">
        <Icon name="arrowLeft" :size="14" />返回作业板
      </router-link>
    </div>

    <div class="admin-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="{ active: section === tab.key }"
        @click="section = tab.key"
      >
        <Icon :name="tab.icon" :size="15" />{{ tab.label }}
      </button>
    </div>

    <Transition name="page" mode="out-in">
      <component :is="current.component" :key="current.key" @navigate="section = $event" />
    </Transition>
  </div>
</template>
