/**
 * /merchant — 商家后台收款概览（Polar 风格 Orders Dashboard，ALEO-MVP-015）。
 *
 * 数据源（保留旧实现的合并逻辑）：
 *  1. 发票系统：GET /api/payment-intents?merchant=xxx
 *  2. 链上记录：钱包 requestRecords('pay_private_v3.aleo') 扫描 Receipt
 *  - 合并后展示累计收款 + 最近支付明细
 *  - View Key 解密语义：金额与付款人信息仅钱包持有者可见
 *
 * 视觉/结构（Polar 风格）：
 *  - 页面头部 h1「Orders」
 *  - 工具栏：Product / Status / Today + Export 按钮（链向 /merchant/export）
 *  - 三张 KPI 卡片：Orders / Revenue / Average Order Value
 *  - 5 列网格表格：Date ↓ / Customer / Product / Status / Amount
 *  - 钱包未连接时：保留原连接钱包提示，但视觉与新壳一致
 */

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'

import { MerchantFilters } from '@/components/merchant/MerchantFilters.tsx'
import { MerchantKpiCards } from '@/components/merchant/MerchantKpiCards.tsx'
import { MerchantOrdersTable } from '@/components/merchant/MerchantOrdersTable.tsx'
import { MerchantTopbar } from '@/components/merchant/MerchantTopbar.tsx'
import { ConnectWalletButton } from '@/components/ConnectWalletButton.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { listPaymentIntents } from '@/server/payment-intents-api.ts'
import type { PaymentIntentRecord } from '@/lib/payment-intents.ts'
import {
  extractMerchantPayments,
  formatAmount,
  mergePaymentEntries,
  summarizePayments,
  type MerchantPaymentEntry,
} from '@/lib/merchant.ts'

export const Route = createFileRoute('/merchant/')({
  component: MerchantDashboard,
})

type DataState =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: MerchantPaymentEntry[]; onchainCount: number }
  | { kind: 'error'; message: string }

function MerchantDashboard() {
  const { loaded, connected, publicKey, requestRecords } = useAleoWallet()
  const [dataState, setDataState] = useState<DataState>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  const merchant = connected && publicKey ? publicKey : null

  useEffect(() => {
    if (!merchant) {
      setDataState({ kind: 'loading' })
      return
    }

    let cancelled = false
    setDataState({ kind: 'loading' })

    const load = async () => {
      try {
        const res = await listPaymentIntents({ data: { merchant } })
        const { intents } = (await res.json()) as { intents: PaymentIntentRecord[] }

        let onchainEntries: MerchantPaymentEntry[] = []
        let onchainCount = 0
        try {
          const records = (await requestRecords('pay_private_v3.aleo', true)) ?? []
          onchainEntries = extractMerchantPayments(records, merchant)
          onchainCount = onchainEntries.length
        } catch {
          onchainCount = 0
        }

        if (!cancelled) {
          setDataState({
            kind: 'ready',
            entries: mergePaymentEntries(intents, onchainEntries),
            onchainCount,
          })
        }
      } catch (err) {
        if (!cancelled) {
          setDataState({
            kind: 'error',
            message: err instanceof Error ? err.message : '收款数据加载失败',
          })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant, reloadKey])

  const summary = useMemo(() => {
    if (dataState.kind !== 'ready') return null
    return summarizePayments(dataState.entries, 50)
  }, [dataState])

  const ordersCount = dataState.kind === 'ready' ? dataState.entries.length : 0
  const totalAmount = summary?.totalAmount ?? '0'

  return (
    <>
      <MerchantTopbar
        left={
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-100">
              Orders
            </h1>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              商家后台 · 收款明细与 View Key 账期
            </p>
          </div>
        }
      />

      {/* 工具栏 + Export 按钮 */}
      <MerchantFilters />

      {/* KPI 卡片 */}
      <MerchantKpiCards
        ordersCount={ordersCount}
        totalAmountCredits={totalAmount}
      />

      {/* 加载 / 错误 / 未连接钱包提示 */}
      {!loaded && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
          钱包适配器加载中…
        </div>
      )}

      {loaded && !connected && (
        <div className="space-y-4 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-6 text-center dark:border-zinc-800/60 dark:bg-zinc-900/60">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-sky-400">
            <Wallet className="h-5 w-5" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              连接钱包以查看收款明细
            </h2>
            <p className="mx-auto max-w-md text-xs text-zinc-500 dark:text-zinc-400">
              您的钱包地址即商家身份。链上 PaymentRecord 仅持有 View Key
              的商家可解密，连接钱包后即可查看。
            </p>
          </div>
          <div className="flex justify-center">
            <ConnectWalletButton />
          </div>
        </div>
      )}

      {connected && dataState.kind === 'loading' && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-8 text-sm text-zinc-500 dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          正在加载收款明细…
        </div>
      )}

      {connected && dataState.kind === 'error' && (
        <div className="space-y-3 rounded-2xl border border-red-500/30 bg-red-50 p-6 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">
          <p className="font-semibold">加载失败</p>
          <p className="text-xs">{dataState.message}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            重试
          </button>
        </div>
      )}

      {/* 订单表 / 空态 */}
      {connected && dataState.kind === 'ready' && (
        <>
          <MerchantOrdersTable entries={dataState.entries} />

          {summary && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              累计{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {formatAmount(summary.totalAmount)} ALEO
              </span>
              ，最近 50 笔订单已展示。
            </p>
          )}

          <p className="rounded-xl border border-indigo-500/20 bg-indigo-50 p-3 text-[11px] leading-relaxed text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/5 dark:text-indigo-200/90">
            链上 PaymentRecord 为密文记录，仅持有 View Key 的商家可解密金额与付款人身份。
            当前数据由已连接钱包（持有 View Key）解密后展示。
          </p>
        </>
      )}
    </>
  )
}