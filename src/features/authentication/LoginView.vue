<script setup lang="ts">
import type { LoginCredentials } from '@/api/auth/authApi'
import { useSessionLifecycle } from '@/app/session/sessionLifecycle'
import LoginForm from './LoginForm.vue'

const lifecycle = useSessionLifecycle()

function authenticate(credentials: LoginCredentials): Promise<void> {
  return lifecycle.login(credentials)
}
</script>

<template><LoginForm :authenticate="authenticate" /></template>
