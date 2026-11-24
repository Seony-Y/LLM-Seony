import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** 폰 앱이 어느 화면이 더 새것인지 비교하는 값을 함께 낸다. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      const source = JSON.stringify({ version: Date.now() })
      this.emitFile({ type: 'asset', fileName: 'version.json', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
})
