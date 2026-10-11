import { defineConfig, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { cloudflare } from '@cloudflare/vite-plugin'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 仅对浏览器（client）环境把裸 `buffer` 指向 npm 的 `buffer` 包：
 * `@solana/web3.js` 的 browser ESM 会 `import ... from 'buffer'`，浏览器没有该内建模块。
 *
 * 绝不能在 SSR / Cloudflare Worker 上改写：worker 有 `nodejs_compat`，`buffer` 应解析为
 * 内建模块；若被改写为 CJS 的 npm 包，worker 构建会产出 `require is not defined`。
 */
function clientBufferAlias(): Plugin {
  return {
    name: 'kethyr:client-buffer-alias',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'client',
    resolveId(source, importer, options) {
      if (source !== 'buffer') return null
      return this.resolve('buffer/', importer, { ...options, skipSelf: true })
    },
  }
}

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    target: 'esnext',
  },
  plugins: [
    clientBufferAlias(),
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      router: {
        routeFileIgnorePattern: '\\.(test|spec)\\.(ts|tsx)$',
      },
    }),
    viteReact(),
  ],
  optimizeDeps: {
    include: [
      'buffer',
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-react-ui',
      '@solana/wallet-adapter-phantom',
    ],
  },
  ssr: {
    noExternal: [
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-react-ui',
      '@solana/wallet-adapter-phantom',
    ],
    optimizeDeps: {
      include: [
        '@solana/wallet-adapter-react',
        '@solana/wallet-adapter-react-ui',
        '@solana/wallet-adapter-phantom',
      ],
    },
  },
})

export default config
