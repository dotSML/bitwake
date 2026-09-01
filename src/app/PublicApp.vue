<script setup lang="ts">
import type { LoginCredentials } from '@/api/auth/authApi'
import LoginForm from '@/features/authentication/LoginForm.vue'

defineProps<{
  authenticate: (credentials: LoginCredentials) => Promise<void>
}>()
</script>

<template><LoginForm :authenticate="authenticate" /></template>
