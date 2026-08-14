import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // contract/aleopay 测试不依赖浏览器；wallet 的 client-only 路径仅做错误分支断言。
    // WASM 相关（aleo.ts 的 initAleoSDK 真实调用）默认跳过，见 tests/aleo.test.ts。
  },
})
