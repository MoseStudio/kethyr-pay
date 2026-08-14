/**
 * /merchant — 商家后台收款概览（ALEO-MVP-015）。
 *
 * 商家连接钱包后（钱包地址即商家身份）：
 * - 数据源双通道：
 *   1. 发票系统：GET /api/payment-intents?merchant=xxx（012 的 PaymentIntent 列表）
 *   2. 链上记录：钱包 requestRecords('pay_private.aleo') 扫描 PaymentRecord
 * - 合并后展示累计收款金额 + 最近支付明细（金额 / 时间 / invoice_id / 付款人）
 * - View Key 解密语义：金额与付款人信息仅钱包持有者（View Key 所有者）可见——
 *   链上 PaymentRecord 由钱包解密后返回，未持有 View Key 无法得到明文。
 */

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { ConnectWalletButton } from '@/components/ConnectWalletButton.tsx'
import { WalletStatus } from '@/components/WalletStatus.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { listPaymentIntents } from '@/server/payment-intents-api.ts'
import type { PaymentIntentRecord } from '@/lib/payment-intents.ts'
import {
  extractMerchantPayments,
  formatAmount,
  formatCreatedAt,
  mergePaymentEntries,
  statusBadgeClass,
  statusLabel,
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
        // 通道 1：发票系统（012）——server fn RPC（REST /api/payment-intents 未注册）。
        // handler 返回 Response，client 端解析 JSON。
        const res = await listPaymentIntents({
          data: { merchant },
        })
        const { intents } = (await res.json()) as { intents: PaymentIntentRecord[] }

        // 通道 2：链上 PaymentRecord（钱包解密后返回明文）
        let onchainEntries: MerchantPaymentEntry[] = []
        let onchainCount = 0
        try {
          const records = (await requestRecords('pay_private_v2.aleo', true)) ?? []
          onchainEntries = extractMerchantPayments(records, merchant)
          onchainCount = onchainEntries.length
        } catch {
          // 链上扫描失败不阻断：仍展示发票系统数据
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

  const stats = useMemo(() => {
    if (dataState.kind !== 'ready') return null
    const entries = dataState.entries
    return {
      total: entries.length,
      paid: entries.filter((e) => e.status === 'paid').length,
      pending: entries.filter((e) => e.status === 'pending').length,
      onchain: dataState.onchainCount,
    }
  }, [dataState])

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex w-full max-w-4xl items-center justify-between self-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Merchant Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            商家后台 · 收款明细与 View Key 账期
          </p>
        </div>
        <WalletStatus />
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-4 self-center">
        {!loaded && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600 shadow-sm">
            钱包适配器加载中…
          </div>
        )}

        {loaded && !connected && (
          <div className="flex flex-col items-center gap-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">连接钱包以查看收款明细</h2>
            <p className="max-w-md text-gray-600">
              您的钱包地址即商家身份。链上 PaymentRecord 仅持有 View Key
              的商家可解密，连接钱包后即可查看。
            </p>
            <ConnectWalletButton />
          </div>
        )}

        {connected && dataState.kind === 'loading' && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-gray-600">正在加载收款明细…</p>
          </div>
        )}

        {connected && dataState.kind === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
            <p className="font-semibold text-red-800">加载失败</p>
            <p className="mt-1 text-sm text-red-700">{dataState.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              重试
            </button>
          </div>
        )}

        {connected && dataState.kind === 'ready' && summary && stats && (
          <>
            {/* 累计金额 */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-wide text-gray-500">累计收款</p>
              <p className="mt-2 text-5xl font-extrabold text-gray-900">
                {formatAmount(summary.totalAmount)}
                <span className="ml-2 text-2xl font-semibold text-gray-500">credits</span>
              </p>
              <p className="mt-2 font-mono text-xs text-gray-400 break-all">
                {merchant}
              </p>
            </div>

            {/* 统计行 */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="发票总数" value={String(stats.total)} />
              <StatCard label="已支付" value={String(stats.paid)} color="text-emerald-600" />
              <StatCard label="待支付" value={String(stats.pending)} color="text-amber-600" />
              <StatCard
                label="链上记录"
                value={String(stats.onchain)}
                color="text-sky-600"
              />
            </div>

            {/* View Key 解密说明（验收标准 2） */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 shadow-sm">
              <p className="font-semibold">View Key 隐私说明</p>
              <p className="mt-1">
                链上 PaymentRecord 为密文记录，仅持有 View Key 的商家可解密金额与付款人身份。
                当前数据由已连接钱包（持有 View Key）解密后展示——未持有 View Key 者无法获得明文。
              </p>
            </div>

            {/* 最近交易 */}
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">最近交易</h2>
                <div className="flex gap-2">
                  <a
                    href="/merchant/invoice"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    铸造发票
                  </a>
                  <a
                    href="/merchant/export"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    导出账期 (View Key)
                  </a>
                </div>
              </div>

              {summary.recent.length === 0 ? (
                <div className="px-6 pb-8 pt-2 text-center text-gray-500">
                  暂无收款记录。创建发票（/pay）并完成支付后，明细将出现在这里。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-6 py-3 font-medium">发票号</th>
                        <th className="px-6 py-3 font-medium">金额</th>
                        <th className="px-6 py-3 font-medium">时间</th>
                        <th className="px-6 py-3 font-medium">状态</th>
                        <th className="px-6 py-3 font-medium">付款人</th>
                        <th className="px-6 py-3 font-medium">来源</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {summary.recent.map((entry) => (
                        <tr key={entry.invoice_id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-mono text-gray-800">
                            {entry.invoice_id}
                          </td>
                          <td className="px-6 py-3 font-semibold text-gray-900">
                            {formatAmount(entry.amount)}
                          </td>
                          <td className="px-6 py-3 text-gray-600">
                            {formatCreatedAt(entry.createdAt)}
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(entry.status)}`}
                            >
                              {statusLabel(entry.status)}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-gray-500">
                            {entry.sender
                              ? `${entry.sender.slice(0, 10)}…${entry.sender.slice(-8)}`
                              : '—'}
                          </td>
                          <td className="px-6 py-3 text-xs text-gray-400">
                            {entry.source === 'onchain' ? '链上' : '发票系统'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  color = 'text-gray-900',
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
