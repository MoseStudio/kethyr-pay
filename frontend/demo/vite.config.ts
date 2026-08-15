import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    target: 'esnext',
  },
  plugins: [
    devtools(),
    nitro(),
    tailwindcss(),
    tanstackStart({
      router: {
        routeFileIgnorePattern: '\\.(test|spec)\\.(ts|tsx)$',
      },
    }),
    viteReact(),
    wasm(),
    topLevelAwait(),
    // @provablehq/sdk 的 browser.js 首行 `import 'core-js/proposals/json-parse-with-source.js'`
    // 是 CJS polyfill（JSON.parse source 参数，仅 Node 端需要）。
    // dev 模式下 @provablehq/sdk 被 optimizeDeps.exclude，浏览器端直接加载该 CJS 文件
    // 会报 `require is not defined`（ALEO-MVP-018 H5 联调）。
    // Node 22+ / 现代浏览器已原生支持，客户端无需 polyfill —— 映射为空虚拟模块。
    // 仅 serve 模式生效：build 时 rolldown 能正确处理 core-js 的 CJS 转换，
    // 虚拟模块反而会干扰 vite-plugin-top-level-await 的 generateBundle。
    {
      name: 'stub-core-js-json-parse',
      apply: 'serve',
      enforce: 'pre',
      resolveId(source) {
        if (source === 'core-js/proposals/json-parse-with-source.js') {
          return '\0stub-core-js-json-parse'
        }
      },
      load(id) {
        if (id === '\0stub-core-js-json-parse') {
          return 'export default undefined;'
        }
      },
    },
  ],
  optimizeDeps: {
    exclude: ['@provablehq/sdk', '@kethyrpay/sdk'],
    include: [
      '@provablehq/aleo-wallet-adaptor-react',
      '@provablehq/aleo-wallet-adaptor-react-ui',
      '@provablehq/aleo-wallet-adaptor-shield',
    ],
  },
  ssr: {
    noExternal: [
      '@provablehq/aleo-wallet-adaptor-react',
      '@provablehq/aleo-wallet-adaptor-react-ui',
      '@provablehq/aleo-wallet-adaptor-shield',
    ],
    optimizeDeps: {
      include: [
        '@provablehq/aleo-wallet-adaptor-react',
        '@provablehq/aleo-wallet-adaptor-react-ui',
        '@provablehq/aleo-wallet-adaptor-shield',
      ],
    },
  },
  worker: {
    plugins: () => [wasm(), topLevelAwait()],
  },
})

export default config
