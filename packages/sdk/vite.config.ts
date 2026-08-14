import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

/**
 * @aleopay/sdk 库模式构建。
 *
 * - WASM 封装：`@provablehq/sdk` 的 `initializeWasm()` 依赖顶层 await 与
 *   `?init` WASM 导入，因此打包时需要 `vite-plugin-wasm` +
 *   `vite-plugin-top-level-await`（与 frontend/aleopay-demo 的 POC 用法一致，
 *   版本 v3.6.0 / v1.6.0）。
 * - SDK 只“封装 init”，实际 WASM 由使用方（宿主应用）加载；
 *   这里仍然带上插件，保证在 SDK 内部引用 @provablehq/sdk 的路径也能被正确处理。
 * - 类型声明（.d.ts）由 tsc（tsconfig.build.json）生成，见 package.json 的 build 脚本。
 */
export default defineConfig({
  build: {
    target: 'esnext',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // 外部化 provablehq 运行时依赖：由使用方（宿主应用）提供。
      external: [
        '@provablehq/sdk',
        '@provablehq/sdk/testnet.js',
        '@provablehq/aleo-types',
        '@provablehq/aleo-wallet-adaptor-core',
        '@provablehq/aleo-wallet-adaptor-shield',
      ],
    },
    sourcemap: true,
    minify: false,
  },
  plugins: [wasm(), topLevelAwait()],
})
