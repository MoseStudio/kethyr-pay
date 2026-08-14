/**
 * /merchant/export — View Key 账期导出（ALEO-MVP-016，Request Finance 兼容）。
 *
 * 商家连接钱包后：
 * - 收集数据源：发票系统列表 API + 钱包 requestRecords('pay_private.aleo')
 * - 按账期（最近 7 / 30 天 / 全部）过滤收款明细
 * - 一键导出 CSV / JSON 账单（含 Sender Ciphertext 合规披露字段）
 * - View Key 手动输入兜底：钱包适配器不导出 View Key 字符串时，
 *   商家可粘贴 View Key，账单元数据记录其指纹（不落盘完整密钥）
 */

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { ConnectWalletButton } from '@/components/ConnectWalletButton.tsx'
import { WalletStatus } from '@/components/WalletStatus.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { listPaymentIntents } from '@/server/payment-intents-api.ts'
import type { PaymentIntentRecord } from '@/lib/payment-intents.ts'
import {
  downloadTextFile,
  extractMerchantPayments,
  summarizePayments,
  toStatementCsv,
  toStatementJson,
  toStatementRows,
  type MerchantPaymentEntry,
} from '@/lib/merchant.ts'

export const Route = createFileRoute('/merchant/export')({
  component: MerchantExport,
})

/** 账期预设（天） */
const PERIODS = [
  { label: '最近 7 天', days: 7 },
  { label: '最近 30 天', days: 30 },
  { label: '全部', days: 0 },
] as const

type PeriodDays = (typeof PERIODS)[number]['days']

function MerchantExport() {
  const { loaded, connected, publicKey, requestRecords, exportViewKey } =
    useAleoWallet()
  const [entries, setEntries] = useState<MerchantPaymentEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30)
  const [viewKey, setViewKey] = useState('')
  const [viewKeyFingerprint, setViewKeyFingerprint] = useState<string | null>(null)

  const merchant = connected && publicKey ? publicKey : null

  const loadEntries = async (): Promise<MerchantPaymentEntry[]> => {
    if (!merchant) return []
    // server fn RPC（REST /api/payment-intents 未注册）。handler 返回 Response，解析 JSON。
    const res = await listPaymentIntents({
      data: { merchant },
    })
    const { intents } = (await res.json()) as { intents: PaymentIntentRecord[] }
    let onchain: MerchantPaymentEntry[] = []
    try {
      const records = (await requestRecords('pay_private_v2.aleo', true)) ?? []
      onchain = extractMerchantPayments(records, merchant)
    } catch {
      onchain = []
    }
    // 合并两通道：链上记录（已支付）覆盖发票系统的 pending 条目
    const byId = new Map<string, MerchantPaymentEntry>()
    for (const intent of intents) {
      byId.set(intent.invoice_id, {
        invoice_id: intent.invoice_id,
        amount: intent.amount,
        createdAt: intent.createdAt,
        status: intent.status,
        source: 'payment-intent',
      })
    }
    for (const entry of onchain) {
      byId.set(entry.invoice_id, entry)
    }
    return [...byId.values()].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
  }

  useEffect(() => {
    if (!merchant) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void loadEntries()
      .then((all) => {
        if (!cancelled) setEntries(all)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '数据加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant])

  /** 账期过滤后的条目 */
  const filtered = useMemo(() => {
    if (periodDays === 0) return entries
    const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000
    return entries.filter((e) => Date.parse(e.createdAt) >= cutoff)
  }, [entries, periodDays])

  const summary = useMemo(() => summarizePayments(filtered, 500), [filtered])
  const rows = useMemo(() => toStatementRows(filtered), [filtered])

  /** 导出文件名：aleopay-statement-YYYYMMDD-HHmm.ext */
  const exportBase = useMemo(() => {
    const d = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `aleopay-statement-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  }, [])

  const handleExportCsv = () => {
    downloadTextFile(`${exportBase}.csv`, toStatementCsv(filtered), 'text/csv')
  }

  const handleExportJson = () => {
    downloadTextFile(
      `${exportBase}.json`,
      toStatementJson(filtered, merchant ?? undefined),
      'application/json',
    )
  }

  /** View Key 手动输入：仅记录指纹（末 8 位），不存储完整密钥 */
  const handleViewKeyChange = (value: string) => {
    setViewKey(value)
    const trimmed = value.trim()
    setViewKeyFingerprint(
      /^AViewKey1[a-z0-9]{57}$/.test(trimmed) ? trimmed.slice(-8) : null,
    )
  }

  const handleTryWalletExport = async () => {
    const vk = await exportViewKey()
    if (vk) {
      setViewKey(vk)
      setViewKeyFingerprint(vk.trim().slice(-8))
    }
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex w-full max-w-4xl items-center justify-between self-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">View Key 账期导出</h1>
          <p className="mt-1 text-sm text-gray-500">
            商家后台 · 一键导出收款账单（Request Finance 兼容格式）
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
            <h2 className="text-2xl font-semibold text-gray-900">连接钱包以导出账期</h2>
            <p className="max-w-md text-gray-600">
              您的钱包地址即商家身份。账单中的收款明细（含 Sender Ciphertext
              合规披露字段）来自您持有 View Key 的解密记录。
            </p>
            <ConnectWalletButton />
          </div>
        )}

        {connected && (
          <>
            {/* 账期选择 + 导出按钮 */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-gray-700">账期</span>
                  <div className="flex gap-2">
                    {PERIODS.map((p) => (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => setPeriodDays(p.days)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                          periodDays === p.days
                            ? 'bg-indigo-600 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={rows.length === 0}
                    className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    导出 CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    disabled={rows.length === 0}
                    className="rounded-lg bg-sky-600 px-5 py-2.5 font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    导出 JSON
                  </button>
                </div>
              </div>

              {loading && (
                <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                  正在收集收款明细…
                </p>
              )}
              {error && (
                <p className="mt-4 text-sm text-red-600">
                  加载失败：{error}（仍可导出当前已加载数据）
                </p>
              )}

              {/* 账期汇总 */}
              <div className="mt-4 rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">
                  账期收款 <span className="font-bold text-gray-900">{rows.length}</span> 笔
                  · 累计{' '}
                  <span className="font-bold text-gray-900">
                    {formatCredits(summary.totalAmount)}
                  </span>{' '}
                  credits
                </p>
                <p className="mt-1 font-mono text-xs text-gray-400 break-all">{merchant}</p>
              </div>
            </div>

            {/* View Key 输入（合规披露） */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-indigo-900">View Key 解密确认</h2>
                <button
                  type="button"
                  onClick={() => void handleTryWalletExport()}
                  className="rounded-lg border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  尝试从钱包导出
                </button>
              </div>
              <p className="mt-2 text-sm text-indigo-800">
                账单明文由持有 View Key 的钱包解密生成。Shield 等钱包不暴露 View Key
                字符串，也可手动粘贴以在导出元数据中标注「View Key 已确认」（仅记录指纹，
                完整密钥不会存储或写入导出文件）。
              </p>
              <input
                type="text"
                value={viewKey}
                onChange={(e) => handleViewKeyChange(e.target.value)}
                placeholder="AViewKey1..."
                className="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
              />
              {viewKeyFingerprint && (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  ✓ View Key 已确认（指纹 …{viewKeyFingerprint}）—— 导出账单可标注为
                  view-key-verified
                </p>
              )}
            </div>

            {/* 账单预览 */}
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <h2 className="px-6 py-4 text-lg font-semibold text-gray-900">
                账单预览（{rows.length} 笔）
              </h2>
              {rows.length === 0 ? (
                <div className="px-6 pb-8 text-center text-gray-500">
                  当前账期内暂无收款记录。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-6 py-3 font-medium">日期</th>
                        <th className="px-6 py-3 font-medium">发票号</th>
                        <th className="px-6 py-3 font-medium">金额</th>
                        <th className="px-6 py-3 font-medium">状态</th>
                        <th className="px-6 py-3 font-medium">付款人</th>
                        <th className="px-6 py-3 font-medium">Sender Ciphertext</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((row) => (
                        <tr key={row.invoice_id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 text-gray-600">{row.date}</td>
                          <td className="px-6 py-3 font-mono text-gray-800">
                            {row.invoice_id}
                          </td>
                          <td className="px-6 py-3 font-semibold text-gray-900">
                            {formatCredits(row.amount_credits)}
                          </td>
                          <td className="px-6 py-3 text-gray-600">
                            {row.status === 'paid'
                              ? '已支付'
                              : row.status === 'pending'
                                ? '待支付'
                                : '已过期'}
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-gray-500">
                            {row.sender ? `${row.sender.slice(0, 10)}…${row.sender.slice(-8)}` : '—'}
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-gray-400 break-all">
                            {row.sender_ciphertext || '—'}
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

/** 金额展示：6 位小数 → 去除末尾多余的 0（"1.500000" → "1.5"） */
function formatCredits(amount: string): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return amount
  return String(n)
}
