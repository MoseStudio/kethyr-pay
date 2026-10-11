/**
 * SolanaWalletButton — 客户端动态加载的 Solana 钱包连接按钮。
 *
 * 与 ConnectWalletButton（Aleo 侧）同一模式：@solana/wallet-adapter-react-ui
 * 仅客户端可用，动态 import 后渲染 WalletMultiButton；加载前渲染禁用占位。
 *
 * 注意：wallet-adapter 默认底色是紫色（#512da8）。这里用一段作用域样式覆盖，
 * 强制对齐 Kethyr 的 blue-600 视觉语言（不依赖 Tailwind 的 `!important` 语法，
 * 因为 v3 前缀 / v4 后缀写法不同，用原生 CSS 更稳）。
 */

import { useEffect, useState, type ComponentType } from 'react'

const WALLET_BUTTON_THEME = `
.kethyr-solana-wallet .wallet-adapter-button,
.kethyr-solana-wallet .wallet-adapter-button-trigger {
  background-color: #2563eb !important;
  color: #ffffff !important;
  font-weight: 600 !important;
  border-radius: 0.5rem !important;
  height: 2.25rem !important;
  line-height: 2.25rem !important;
  font-size: 0.75rem !important;
  width: 100% !important;
  justify-content: center !important;
  padding: 0 0.75rem !important;
}
.kethyr-solana-wallet .wallet-adapter-button:not([disabled]):hover {
  background-color: #3b82f6 !important;
}
`

export function SolanaWalletButton() {
  const [Button, setButton] = useState<ComponentType<{ className?: string }> | null>(null)

  useEffect(() => {
    import('@solana/wallet-adapter-react-ui').then(({ WalletMultiButton }) => {
      setButton(() => WalletMultiButton)
    })
  }, [])

  if (!Button) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center rounded-lg bg-blue-600/60 text-xs font-semibold text-white opacity-70"
      >
        Connect Solana wallet
      </button>
    )
  }

  return (
    // WalletMultiButton 会把外部 className 覆盖掉，因此用外层 wrapper 承载
    // 作用域样式（见 WALLET_BUTTON_THEME）。
    <div className="kethyr-solana-wallet w-full">
      <style>{WALLET_BUTTON_THEME}</style>
      <Button />
    </div>
  )
}
