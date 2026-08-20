/**
 * /merchant/export — View Key 账期导出（ALEO-MVP-016，Request Finance 兼容）。
 *
 * 商家连接钱包后：
 * - 收集数据源：发票系统列表 API + 钱包 requestRecords('pay_private_v3.aleo')
 * - 按账期（最近 7 / 30 天 / 全部）过滤收款明细
 * - 一键导出 CSV / JSON 账单（含 Sender Ciphertext 合规披露字段）
 * - View Key 手动输入兜底：钱包适配器不导出 View Key 字符串时，
 *   商家可粘贴 View Key，账单元数据记录其指纹（不落盘完整密钥）
 */

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'

import { MerchantTopbar } from '@/components/merchant/MerchantTopbar.tsx'
import { ConnectWalletButton } from '@/components/ConnectWalletButton.tsx'
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
      const records = (await requestRecords('pay_private_v3.aleo', true)) ?? []
      onchain = extractMerchantPayments(records, merchant)
    } catch {
      onchain = []
    }
    // 合并两通道：链上已支付保留发票创建时间，状态/金额/sender 覆盖
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
      const existing = byId.get(entry.invoice_id)
      if (existing) {
        byId.set(entry.invoice_id, {
          ...existing,
          amount: entry.amount,
          status: entry.status,
          sender: entry.sender,
          sender_ciphertext: entry.sender_ciphertext,
          source: 'onchain',
        })
      } else {
        byId.set(entry.invoice_id, entry)
      }
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

  /** 导出文件名：kethyrpay-statement-YYYYMMDD-HHmm.ext */
  const exportBase = useMemo(() => {
    const d = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `kethyrpay-statement-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
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
    <>
      <MerchantTopbar
        left={
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-100">
              View Key 账期导出
            </h1>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              商家后台 · 一键导出收款账单（Request Finance 兼容格式）
            </p>
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        {!loaded && (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
            钱包适配器加载中…
          </div>
        )}

        {loaded && !connected && (
          <div className="space-y-4 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-8 text-center dark:border-zinc-800/60 dark:bg-zinc-900/60">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-sky-400">
              <Wallet className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              连接钱包以导出账期
            </h2>
            <p className="mx-auto max-w-md text-xs text-zinc-500 dark:text-zinc-400">
              您的钱包地址即商家身份。账单中的收款明细（含 Sender Ciphertext
              合规披露字段）来自您持有 View Key 的解密记录。
            </p>
            <div className="flex justify-center">
              <ConnectWalletButton />
            </div>
          </div>
        )}

        {connected && (
          <>
            {/* 账期选择 + 导出按钮 */}
            <div className="space-y-4 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-6 dark:border-zinc-800/60 dark:bg-zinc-900/60">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    账期
                  </span>
                  <div className="flex gap-2">
                    {PERIODS.map((p) => (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => setPeriodDays(p.days)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                          periodDays === p.days
                            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-200 dark:hover:bg-zinc-900'
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
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    导出 CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    disabled={rows.length === 0}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    导出 JSON
                  </button>
                </div>
              </div>

              {loading && (
                <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  正在收集收款明细…
                </p>
              )}
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  加载失败：{error}（仍可导出当前已加载数据）
                </p>
              )}

              {/* 账期汇总 */}
              <div className="rounded-xl border border-zinc-200/60 bg-white p-3 dark:border-zinc-800/60 dark:bg-zinc-950/40">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  账期收款{' '}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {rows.length}
                  </span>{' '}
                  笔 · 累计{' '}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatCredits(summary.totalAmount)}
                  </span>{' '}
                  ALEO
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                  {merchant}
                </p>
              </div>
            </div>

            {/* View Key 输入（合规披露） */}
            <div className="space-y-3 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-6 dark:border-zinc-800/60 dark:bg-zinc-900/60">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  View Key 解密确认
                </h2>
                <button
                  type="button"
                  onClick={() => void handleTryWalletExport()}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  尝试从钱包导出
                </button>
              </div>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                账单明文由持有 View Key 的钱包解密生成。Shield 等钱包不暴露 View Key
                字符串，也可手动粘贴以在导出元数据中标注「View Key 已确认」（仅记录指纹，
                完整密钥不会存储或写入导出文件）。
              </p>
              <input
                type="text"
                value={viewKey}
                onChange={(e) => handleViewKeyChange(e.target.value)}
                placeholder="AViewKey1..."
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100 dark:placeholder-zinc-600"
              />
              {viewKeyFingerprint && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  ✓ View Key 已确认（指纹 …{viewKeyFingerprint}）—— 导出账单可标注为
                  view-key-verified
                </p>
              )}
            </div>

            {/* 账单预览 */}
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-transparent">
              <h2 className="border-b border-zinc-200 px-6 py-4 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
                账单预览（{rows.length} 笔）
              </h2>
              {rows.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  当前账期内暂无收款记录。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                      <tr>
                        <th className="px-6 py-3">日期</th>
                        <th className="px-6 py-3">发票号</th>
                        <th className="px-6 py-3">金额</th>
                        <th className="px-6 py-3">状态</th>
                        <th className="px-6 py-3">付款人</th>
                        <th className="px-6 py-3">Sender Ciphertext</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.invoice_id}
                          className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/40"
                        >
                          <td className="px-6 py-3 text-zinc-600 dark:text-zinc-400">
                            {row.date}
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                            {row.invoice_id}
                          </td>
                          <td className="px-6 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatCredits(row.amount_credits)} ALEO
                          </td>
                          <td className="px-6 py-3 text-zinc-600 dark:text-zinc-400">
                            {row.status === 'paid'
                              ? '已支付'
                              : row.status === 'pending'
                                ? '待支付'
                                : '已过期'}
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                            {row.sender
                              ? `${row.sender.slice(0, 10)}…${row.sender.slice(-8)}`
                              : '—'}
                          </td>
                          <td className="break-all px-6 py-3 font-mono text-xs text-zinc-400 dark:text-zinc-500">
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
    </>
  )
}

/** 金额展示：6 位小数 → 去除末尾多余的 0（"1.500000" → "1.5"） */
function formatCredits(amount: string): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return amount
  return String(n)
}
