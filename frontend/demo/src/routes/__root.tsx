import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { PerformancePanel } from '@/components/PerformancePanel.tsx'
import { PerformanceProvider } from '@/components/PerformanceProvider.tsx'
import { WalletProviders } from '@/components/WalletProviders.tsx'
import appCss from '@/styles.css?url'
// aleo-wallet-adaptor-react-ui 的 WalletModal 样式（遮罩/定位/列表）。
// 未导入时 Connect Wallet 点击后 modal 无样式不可见，表现为「点了没反应」。
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css'

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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <PerformanceProvider>
          <WalletProviders>
            {children}
            <PerformancePanel />
          </WalletProviders>
        </PerformanceProvider>
        <Scripts />
      </body>
    </html>
  )
}
