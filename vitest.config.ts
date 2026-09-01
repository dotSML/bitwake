import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const shared = {
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: {
    __DEPLOYMENT_MODE__: JSON.stringify('mock'),
    __MOCK_BACKEND__: JSON.stringify(true),
    __NEOTORRENT_VERSION__: JSON.stringify('test'),
    __NEOTORRENT_REVISION__: JSON.stringify('test'),
    __NEOTORRENT_BUILD_DATE__: JSON.stringify('')
  }
}

export default defineConfig({
  ...shared,
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup/unit.ts']
        }
      },
      {
        ...shared,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/component/**/*.test.ts'],
          setupFiles: ['tests/setup/component.ts']
        }
      }
    ],
    coverage: { reporter: ['text', 'html'] }
  }
})
