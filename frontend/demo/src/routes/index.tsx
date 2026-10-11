/**
 * `/` — 落地页（Solana）。
 *
 * 只有两个入口：雇主控制台与员工门户。余额按时间线性解锁，不依赖任何轮询。
 */

import { Link, createFileRoute } from '@tanstack/react-router'

import { BrandHeader } from '@/components/BrandHeader.tsx'
import { ThemeToggle } from '@/components/ThemeToggle.tsx'

export const Route = createFileRoute('/')({
  component: Home,
})

const PROGRAM_ID = 'Afm1YLnn7WBqbGgBvtxt8GMdV4LbogNqkhbtErXouP4v'

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4 transition-colors duration-200 dark:bg-zinc-950 md:p-8">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <BrandHeader subtitle="Streaming Payroll on Solana" />
          <ThemeToggle />
        </div>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl transition-colors duration-200 md:p-8 dark:border-zinc-800 dark:bg-[#121214] dark:shadow-2xl">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Salary that accrues by the second
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            The employer funds a stream once; the balance unlocks linearly with time and the
            employee withdraws whenever they want. Tax is withheld and routed to the company
            treasury atomically, in the same instruction — no per-second transactions.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/payroll"
              className="inline-flex h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Employer console →
            </Link>
            <Link
              to="/payroll/employee"
              className="inline-flex h-11 items-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Employee portal →
            </Link>
          </div>

          <p className="mt-5 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
            Solana devnet · program {PROGRAM_ID.slice(0, 8)}…
          </p>
        </section>

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          KethyrPay — streaming payroll &amp; treasury ·{' '}
          <a
            href="https://github.com/MoseStudio/kethyr-pay"
            className="transition hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            GitHub
          </a>
        </p>
      </div>
    </main>
  )
}
