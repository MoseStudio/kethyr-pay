/**
 * MerchantMobileNavContext — 移动端抽屉开关的轻量 Context。
 *
 * 动机：
 *  - MerchantShell 拥有 mobileOpen 的实际状态（管理遮罩 / Esc 关闭）。
 *  - 但触发开关的入口是各个子页面 MerchantTopbar 内的汉堡按钮，
 *    它们不持有 Shell 引用，也不方便层层 props drilling。
 *  - 用 Context 让 Shell 提供状态 / handler，子页面 Topbar 直接消费。
 */

import { createContext, useContext } from 'react'

export interface MerchantMobileNavContextValue {
  openMobile: () => void
  closeMobile: () => void
  mobileOpen: boolean
}

export const MerchantMobileNavContext =
  createContext<MerchantMobileNavContextValue | null>(null)

export function useMerchantMobileNav(): MerchantMobileNavContextValue {
  const ctx = useContext(MerchantMobileNavContext)
  if (!ctx) {
    // 不在 MerchantShell 内时给一个安全的 no-op 默认值
    return {
      openMobile: () => {},
      closeMobile: () => {},
      mobileOpen: false,
    }
  }
  return ctx
}