import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { PerformancePanel } from '@/components/PerformancePanel.tsx'
import { PerformanceProvider } from '@/components/PerformanceProvider.tsx'
import { WalletProviders } from '@/components/WalletProviders.tsx'
import appCss from '@/styles.css?url'
// aleo-wallet-adaptor-react-ui 的 WalletModal 样式（遮罩/定位/列表）。
// 未导入时 Connect Wallet 点击后 modal 无样式不可见，表现为「点了没反应」。
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css'

/**
 * No-flash theme bootstrap.
 * 在首屏 <head> 内联执行，避免 React mount 前页面闪一次浅色背景。
 * 与 src/hooks/useTheme.ts 的 STORAGE_KEY / QUERY 保持一致：
 * - 读 'kethyr-theme'（'light' | 'dark' | 'system'）
 * - 'system' 时跟随 prefers-color-scheme: dark
 * - 把结果写到 <html>.classList.dark（Tailwind v4 dark: 变体依赖此 class）
 */
const themeBootstrap = `
(function(){try{var s=localStorage.getItem('kethyr-theme');var m=(s==='light'||s==='dark'||s==='system')?s:'system';var d=m==='dark'||(m==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',!!d);}catch(e){}})();
`.trim()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'KethyrPay Demo' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

const enablePerformancePanel = import.meta.env.VITE_ENABLE_PERFORMANCE_PANEL === 'true'

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* 内联脚本必须放在 HeadContent 之后，确保 Tailwind reset 等 head 资源先生效 */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen bg-zinc-100 text-zinc-900 antialiased transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-100">
        <PerformanceProvider>
          <WalletProviders>
            {children}
            {enablePerformancePanel && <PerformancePanel />}
          </WalletProviders>
        </PerformanceProvider>
        <Scripts />
      </body>
    </html>
  )
}