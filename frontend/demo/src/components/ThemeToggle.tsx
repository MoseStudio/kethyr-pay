/**
 * ThemeToggle — 极简明暗模式切换按钮。
 *
 * - 在 mount 前渲染一个等大的占位元素（避免按钮宽度跳变导致的布局抖动）
 * - 图标映射：
 *   - theme = 'light'  → Sun
 *   - theme = 'dark'   → Moon
 *   - theme = 'system' → Monitor（视觉上明确「跟随系统」状态）
 * - 点击循环切换：light → dark → system → light
 *
 * 仅依赖自研 useTheme hook（无 next-themes）。
 */

import { Monitor, Moon, Sun } from 'lucide-react'

import { useTheme, type ThemeMode } from '@/hooks/useTheme.ts'

const ORDER: ThemeMode[] = ['light', 'dark', 'system']

function nextMode(current: ThemeMode): ThemeMode {
  const idx = ORDER.indexOf(current)
  return ORDER[(idx + 1) % ORDER.length]!
}

function nextActionLabel(current: ThemeMode): string {
  switch (current) {
    case 'light':
      return 'Switch to dark mode'
    case 'dark':
      return 'Switch to system theme'
    case 'system':
      return 'Switch to light mode'
  }
}

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, mounted } = useTheme('system')

  // mount 前占位，避免按钮在 mount 后跳变引起 CLS
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-200"
      >
        <span className="sr-only">Loading theme</span>
      </button>
    )
  }

  const Icon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun

  return (
    <button
      type="button"
      onClick={() => setTheme(nextMode(theme))}
      aria-label={nextActionLabel(theme)}
      title={`Theme: ${theme}${theme === 'system' ? ` (resolved: ${resolvedTheme})` : ''}`}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {/* system 模式下加一个小圆点，强提示「跟随系统」而非用户显式选择 */}
      {theme === 'system' && (
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 dark:bg-sky-400"
        />
      )}
    </button>
  )
}