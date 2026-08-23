import { createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Check, Code2, Copy, CreditCard, Database, Globe2, KeyRound, Layers3, Menu, RefreshCcw, ShieldCheck, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { codeToHtml } from 'shiki'
import { KethyrLogo } from '@/components/merchant/KethyrLogo.tsx'

export const Route = createFileRoute('/')({ component: Home })

const providers = [
  ['Hosted Checkout', CreditCard, 'bg-violet-100 text-violet-600'],
  ['JS SDK', Code2, 'bg-sky-100 text-sky-600'],
  ['Atomic settlement', RefreshCcw, 'bg-amber-100 text-amber-600'],
  ['View Key', KeyRound, 'bg-rose-100 text-rose-600'],
  ['Aleo', ShieldCheck, 'bg-emerald-100 text-emerald-600'],
] as const

const FLOW_CODE = `import { KethyrPay } from "@kethyrpay/sdk";
const pay = await KethyrPay.create();

// mint invoice to payer (single tx, owner=payer)
await pay.mintInvoiceToPayer({
  merchant: "aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69", payee: "aleo1payer...", amount: "1.50",
});
const intent = await pay.createPayment({
  merchant: "aleo1cdsz2pdt...", amount: "1.50", currency: "ALEO",
});
// ZK proof in browser — keys never leave wallet
// pay_invoice atomic: transfer_private + receipts (1 tx)
await pay.verifyPayment(intent.id);`

const features = [
  ['Private by default', 'Payment amount and payer identity stay shielded on Aleo. The merchant decrypts what it needs with a View Key.', ShieldCheck],
  ['One atomic payment flow', 'pay_invoice transfers private ALEO, consumes the invoice, and creates receipts in one transaction — no intermediate state.', Layers3],
  ['Developer-first SDK', 'Create a payment and verify its result with a small JavaScript API. Complex ZK logic stays behind a few calls.', Zap],
  ['Hosted Checkout', 'Create an invoice and send customers to a ready-made private checkout page — no payment UI to build.', Globe2],
  ['Clear status at every step', 'See authorization, confirmation, and settlement progress as the transaction moves from wallet to chain.', Database],
  ['Selective compliance', 'Sender Ciphertext keeps the flow private while authorized View Keys make records auditable and exportable.', ShieldCheck],
  ['No hidden custody', 'KethyrPay coordinates payment intents without taking possession of customer funds or private keys.', Layers3],
  ['Ready for subscriptions', 'Start with reliable one-time privacy payments today; the escrow subscription engine is the next stage of the roadmap.', ShieldCheck],
] as const

function Home() {
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [highlightedCode, setHighlightedCode] = useState('')
  useEffect(() => {
    let active = true
    void codeToHtml(FLOW_CODE, { lang: 'typescript', theme: 'light-plus' }).then((html) => {
      if (active) setHighlightedCode(html)
    })
    return () => {
      active = false
    }
  }, [])
  const copy = async () => {
    await navigator.clipboard?.writeText('npm i @kethyrpay/sdk')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  return (
    <main className="min-h-screen overflow-hidden bg-[#fafafa] text-[#18181b] selection:bg-[#18181b] selection:text-white">
      <nav className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6 lg:px-8">
        <a href="#" className="flex items-center gap-2.5 font-semibold tracking-tight"><span className="flex size-8 items-center justify-center rounded-lg bg-[#18181b] text-white"><KethyrLogo size={20} /></span>KethyrPay</a>
        <div className="hidden items-center gap-1 md:flex">
          <a href="#features" className="rounded-full px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">Why KethyrPay</a>
          <a href="/merchant" className="rounded-full px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">Get started</a>
          <a href="https://github.com/MoseStudio/kethyr-pay" target="_blank" rel="noreferrer" className="rounded-full px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">GitHub</a>
          <a href="#demo" className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[#18181b] px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">See how it works <ArrowRight size={14} /></a>
        </div>
        <button type="button" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)} className="rounded-lg p-2 md:hidden">{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </nav>
      {menuOpen && <div className="mx-6 mb-2 flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg md:hidden"><a href="#features" className="rounded-xl px-3 py-2.5 text-sm">Why KethyrPay</a><a href="/merchant" className="rounded-xl px-3 py-2.5 text-sm">Get started</a><a href="#demo" className="rounded-xl bg-zinc-900 px-3 py-2.5 text-sm text-white">See how it works <ArrowRight className="inline" size={14} /></a></div>}

      <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 lg:px-8 lg:pb-32 lg:pt-24">
        <div className="pointer-events-none absolute -right-32 top-6 size-[28rem] rounded-full bg-gradient-to-br from-zinc-200/70 via-zinc-100/20 to-transparent blur-3xl" />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
          <a href="#quickstart" className="group mb-8 inline-flex items-center gap-2 font-mono text-xs text-zinc-500 hover:text-zinc-900"><span className="size-1.5 rounded-full bg-emerald-500" /> Privacy-first payment gateway on Aleo <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" /></a>
          <h1 className="max-w-[18ch] text-balance text-[2.5rem] font-medium leading-[1.05] tracking-tight sm:text-7xl lg:text-8xl">Accept privately. Settle simply.</h1>
          <p className="mt-7 max-w-[46ch] text-pretty text-base leading-relaxed text-zinc-500 sm:text-xl">KethyrPay gives SaaS teams a Stripe-like privacy gateway for Aleo. Collect a payment, verify it on chain, and keep sensitive customer data shielded.</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={copy} className="group inline-flex h-11 items-center gap-3 rounded-full border border-zinc-200 bg-white px-5 font-mono text-sm transition hover:bg-zinc-100"><span className="text-zinc-400">$</span> npm i @kethyrpay/sdk {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4 text-zinc-400" />}</button>
            <a href="#quickstart" className="inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-medium hover:bg-zinc-100">See the flow <ArrowRight className="size-4" /></a>
          </div>
        </div>
        <div className="mt-20 overflow-hidden border-y border-zinc-200 py-7"><p className="mb-6 text-center font-mono text-xs text-zinc-500">Private payments, without the friction — <a href="#features" className="text-zinc-900 underline-offset-4 hover:underline">see how KethyrPay works →</a></p><div className="flex flex-wrap justify-center gap-x-8 gap-y-5 opacity-70 sm:gap-x-12">{providers.map(([label, Icon, color]) => <div key={label} className="flex items-center gap-2 font-mono text-xs text-zinc-500"><span className={`flex size-7 items-center justify-center rounded-lg ${color}`}><Icon size={15} strokeWidth={1.8} /></span>{label}</div>)}</div></div>
      </section>

      <section className="border-y border-zinc-200 bg-white" id="demo"><div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-8 lg:py-32"><div><p className="font-mono text-xs text-zinc-400">LIVE SNIPPET</p><h2 className="mt-4 text-4xl font-medium tracking-[-0.04em] sm:text-5xl">The same simple flow.<br />Every payment.</h2><p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-500">Connect a wallet, authorize a subscription, and let KethyrPay handle the private settlement flow on Aleo.</p><a href="/#demo" className="mt-8 inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline">See the payment flow <ArrowRight size={15} /></a></div>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-[#fafafa] shadow-2xl shadow-zinc-300/30"><div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3"><div className="flex gap-1.5"><span className="size-2.5 rounded-full bg-red-400/70" /><span className="size-2.5 rounded-full bg-amber-300/70" /><span className="size-2.5 rounded-full bg-emerald-400/70" /></div><button type="button" onClick={copy} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button></div>{highlightedCode ? <div className="shiki-code overflow-hidden p-6 font-mono text-[13px] font-medium leading-7 text-zinc-800" dangerouslySetInnerHTML={{ __html: highlightedCode }} /> : <pre className="overflow-hidden whitespace-pre-wrap break-words p-6 font-mono text-[13px] font-medium leading-7 text-zinc-800">{FLOW_CODE}</pre>}</div>
      </div></section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-24 lg:px-8 lg:py-32"><p className="font-mono text-xs text-zinc-400">CAPABILITIES</p><h2 className="mt-4 max-w-xl text-4xl font-medium tracking-[-0.04em] sm:text-5xl">Everything you need to get paid.</h2><p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-500">A complete payment flow for customers and merchants — private authorization, recurring charges, clear status, and on-chain settlement in one place.</p><div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 md:grid-cols-3">{features.map(([title, body, Icon]) => <article key={title} className="bg-[#fafafa] p-7 transition hover:bg-white"><Icon size={22} strokeWidth={1.5} className="text-zinc-500" /><h3 className="mt-14 text-xl font-medium tracking-tight">{title}</h3><p className="mt-3 text-sm leading-relaxed text-zinc-500">{body}</p><a href="/#quickstart" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium hover:underline">Explore KethyrPay <ArrowRight size={14} /></a></article>)}</div></section>

      <section id="quickstart" className="border-y border-zinc-200 bg-white"><div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:px-8 lg:py-32"><div><p className="font-mono text-xs text-zinc-400">PAYMENT FLOW</p><h2 className="mt-4 text-4xl font-medium tracking-[-0.04em] sm:text-5xl">From invoice to confirmed payment.</h2><p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-500">One atomic flow moves a private ALEO record from payer to merchant. Every state is explicit, verifiable, and free of intermediate custody.</p></div><div className="relative space-y-7 pl-1"><div className="absolute bottom-8 left-4 top-8 w-px bg-zinc-200" /><div className="relative flex gap-5"><span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-xs text-zinc-500">1</span><div><h3 className="font-medium">Mint to payer</h3><p className="mt-1 font-mono text-xs text-zinc-400">mint_to_payer · owner = payer</p><p className="mt-2 text-sm text-zinc-500">The merchant creates an invoice record owned by the payer.</p></div></div><div className="relative flex gap-5"><span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-100 font-mono text-xs text-sky-600">2</span><div><h3 className="font-medium">Prove in browser</h3><p className="mt-1 font-mono text-xs text-zinc-400">ZK proof · keys never leave</p><p className="mt-2 text-sm text-zinc-500">The wallet prepares the private payment locally with client-side proving.</p></div></div><div className="relative flex gap-5"><span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-mono text-xs text-emerald-600">3</span><div><h3 className="font-medium">Atomic pay_invoice</h3><p className="mt-1 font-mono text-xs text-zinc-400">transfer_private + receipts · 1 tx</p><p className="mt-2 text-sm text-zinc-500">Private transfer, invoice consumption, and dual receipts settle together.</p></div></div></div></div></section>

      <section className="mx-auto max-w-6xl px-6 py-24 text-center lg:px-8 lg:py-32"><Globe2 className="mx-auto text-zinc-300" size={30} strokeWidth={1.2} /><h2 className="mx-auto mt-6 max-w-2xl text-5xl font-medium tracking-[-0.06em] sm:text-7xl">Ship private payments once.</h2><p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-zinc-500">Developer-first, compliant by design, and built around Aleo. Add private checkout without rebuilding the ZK payment flow.</p><a href="/merchant" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#18181b] px-5 py-3 text-sm font-medium text-white hover:bg-zinc-700">Explore KethyrPay <ArrowRight size={15} /></a></section>
      <footer className="border-t border-zinc-200"><div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between lg:px-8"><div><p className="font-semibold text-zinc-900">KethyrPay</p><p className="mt-1 max-w-sm">A Stripe-like privacy gateway for SaaS teams on Aleo.</p></div><div className="flex items-center gap-5"><a href="/#quickstart" className="hover:text-zinc-900">Docs</a><a href="https://github.com/MoseStudio/kethyr-pay" className="hover:text-zinc-900">GitHub</a><a href="#quickstart" className="hover:text-zinc-900">npm</a><span className="font-mono text-xs">MIT © 2026</span></div></div></footer>
    </main>
  )
}
