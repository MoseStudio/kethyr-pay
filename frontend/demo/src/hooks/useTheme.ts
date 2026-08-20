/**
 * useTheme — 极简主题切换 hook（无外部依赖）。
 *
 * 设计动机：项目是 TanStack Start + Vite（非 Next.js），按 HeroUI 官方文档
 * 推荐路径，自己实现一个等价的 theme provider：
 * - 用 localStorage 持久化用户选择（'light' | 'dark' | 'system'）
 * - 'system' 时跟随 `prefers-color-scheme` 媒体查询
 * - 把当前实际生效的主题写到 `<html>` 的 `class` 上，Tailwind 的 `dark:` 变体即可触发
 * - SSR 阶段 resolvedTheme 默认是 'light'，客户端 mount 后再校正（避免 hydration mismatch）
 *
 * 使用：
 *   const { theme, resolvedTheme, setTheme } = useTheme('system')
 *   <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>...</button>
 */

import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'kethyr-theme'
const QUERY = '(prefers-color-scheme: dark)'

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return 'system'
}

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia(QUERY).matches ? 'dark' : 'light'
}

function applyThemeClass(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
}

/**
 * Apply the chosen theme mode to <html>. Idempotent and safe to call on
 * mount; the inline no-flash script in __root.tsx already applies the
 * stored value before hydration, so this only re-syncs after that.
 */
function applyTheme(mode: ThemeMode) {
  const resolved = mode === 'system' ? resolveSystemTheme() : mode
  applyThemeClass(resolved)
  return resolved
}

export interface UseThemeResult {
  /** 用户选择的模式：'light' | 'dark' | 'system' */
  theme: ThemeMode
  /** 实际生效的主题（system 时由 prefers-color-scheme 解析） */
  resolvedTheme: ResolvedTheme
  setTheme: (next: ThemeMode) => void
  /** 是否已经在客户端 mount 完成；SSR 期间为 false，用于避免 hydration mismatch */
  mounted: boolean
}

export function useTheme(defaultMode: ThemeMode = 'system'): UseThemeResult {
  // SSR/初帧统一返回 light；client mount 后通过 effect 校正。
  // 这样可以避免 hydration mismatch（服务端拿不到 localStorage / matchMedia）。
  const [theme, setThemeState] = useState<ThemeMode>(defaultMode)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = readStoredTheme()
    setThemeState(stored)
    setResolvedTheme(applyTheme(stored))
    setMounted(true)

    // 跟随系统：matchMedia 变化时重新 resolve
    const mq = window.matchMedia(QUERY)
    const onChange = () => {
      setThemeState((prev) => {
        if (prev !== 'system') return prev
        const next = mq.matches ? 'dark' : 'light'
        setResolvedTheme(next)
        applyThemeClass(next)
        return prev
      })
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setThemeState(next)
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // localStorage 不可用（如隐私模式）静默降级
      }
      const resolved = applyTheme(next)
      setResolvedTheme(resolved)
    },
    [],
  )

  // 挂载前固定返回默认值，避免 SSR/CSR 不一致导致 hydration warning
  if (!mounted) {
    return {
      theme: defaultMode,
      resolvedTheme: 'light',
      setTheme,
      mounted: false,
    }
  }

  return { theme, resolvedTheme, setTheme, mounted: true }
}