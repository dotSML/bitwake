<script setup lang="ts">
import { Eye, EyeOff, LoaderCircle, Waves } from '@lucide/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LoginCredentials } from '@/api/auth/authApi'
import { isApiError } from '@/api/core/errors'

const props = defineProps<{
  authenticate: (credentials: LoginCredentials) => Promise<void>
}>()

const { t } = useI18n()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)

async function submit(): Promise<void> {
  if (submitting.value || !username.value || !password.value) return
  submitting.value = true
  error.value = null
  const credentials = { username: username.value, password: password.value }
  password.value = ''
  try {
    await props.authenticate(credentials)
  } catch (cause) {
    if (isApiError(cause)) {
      if (cause.status === 401) error.value = t('auth.invalid')
      else if (cause.status === 403) error.value = t('auth.forbidden')
      else error.value = cause.message
    } else {
      error.value = t('auth.connection')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page" data-public-entry>
    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-mark" aria-hidden="true"><Waves :size="24" /></div>
      <p class="login-brand">{{ t('app.name') }}</p>
      <h1 id="login-title">{{ t('auth.title') }}</h1>
      <p class="login-subtitle">{{ t('auth.subtitle') }}</p>
      <form class="login-form" novalidate @submit.prevent="submit">
        <div>
          <label class="label" for="username">{{ t('auth.username') }}</label>
          <input
            id="username"
            v-model="username"
            class="field"
            name="username"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            required
            autofocus
          />
        </div>
        <div>
          <label class="label" for="password">{{ t('auth.password') }}</label>
          <div class="password-field">
            <input
              id="password"
              v-model="password"
              class="field"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
            />
            <button
              class="password-toggle"
              type="button"
              :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="19" aria-hidden="true" />
              <Eye v-else :size="19" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p v-if="error" id="login-error" class="login-error" role="alert">{{ error }}</p>
        <button
          class="btn btn-primary login-submit"
          type="submit"
          :disabled="submitting || !username || !password"
          :aria-describedby="error ? 'login-error' : undefined"
        >
          <LoaderCircle v-if="submitting" class="spin" :size="18" aria-hidden="true" />
          {{ submitting ? t('auth.signingIn') : t('auth.submit') }}
        </button>
      </form>
      <p class="login-footnote">
        {{ t('auth.privacy') }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  width: 100%;
  min-height: 100%;
  place-items: center;
  overflow: auto;
  background:
    radial-gradient(circle at 20% 15%, rgb(var(--color-accent) / 0.08), transparent 28rem),
    rgb(var(--color-canvas));
  padding: 28px 16px;
}
.login-panel {
  width: min(410px, 100%);
  border: 1px solid rgb(var(--color-line));
  border-radius: 14px;
  background: rgb(var(--color-surface));
  box-shadow: 0 18px 50px rgb(15 23 42 / 0.08);
  padding: 30px;
}
.login-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 11px;
  background: rgb(var(--color-accent));
  color: white;
}
.login-brand {
  margin: 15px 0 5px;
  color: rgb(var(--color-accent));
  font-weight: 720;
  letter-spacing: 0.01em;
}
h1 {
  margin: 0;
  font-size: 25px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.login-subtitle {
  margin: 9px 0 23px;
  color: rgb(var(--color-muted));
}
.login-form {
  display: grid;
  gap: 17px;
}
.password-field {
  position: relative;
}
.password-field .field {
  padding-right: 48px;
}
.password-toggle {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  width: 40px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
}
.login-error {
  margin: -3px 0 0;
  border-left: 3px solid rgb(var(--color-danger));
  color: rgb(var(--color-danger));
  padding: 4px 0 4px 10px;
  font-size: 13px;
}
.login-submit {
  width: 100%;
  min-height: 43px;
  margin-top: 2px;
}
.login-footnote {
  margin: 22px 0 0;
  color: rgb(var(--color-muted));
  font-size: 12px;
  line-height: 1.55;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 480px) {
  .login-panel {
    border: 0;
    background: transparent;
    box-shadow: none;
    padding: 20px 8px;
  }
}
</style>
