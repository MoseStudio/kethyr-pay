import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 前端单测配置（独立于 vite.config.ts，避免 TanStack Start / nitro 插件干扰）。
 * 测试对象是纯逻辑（checkout / payment-intents / store / api handlers），
 * node 环境即可。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
})
