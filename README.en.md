# KethyrPay — Privacy-First Payment Gateway on Aleo

> **Aleo x OpenBuild APAC Hackathon · PAY Privacy Payment Track**

<div align="center">

**[简体中文](README.md) · [English](README.en.md)**

</div>

## Promo Video

<video src="https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/Kethyrpay.mp4" controls width="100%" poster="https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/poster.jpg"></video>

[![KethyrPay promo video](https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/poster.jpg)](https://github.com/MoseStudio/kethyr-pay/blob/main/video/out/Kethyrpay.mp4)

---

KethyrPay is a **developer-first, privacy-by-default, compliance-friendly** Stripe-like private checkout and subscription payment gateway.

Merchants integrate with a few lines of SDK code. Payers generate real ZK proofs locally in the browser (client-side proving — private keys never leave the wallet). The on-chain `PaymentRecord` carries a **Sender Ciphertext** commitment — the amount and payer identity can only be decrypted by the merchant holding the View Key, satisfying both privacy and compliance auditing.

## Problems & Solutions

| Role | Core Problem | KethyrPay Solution |
|------|--------------|--------------------|
| SaaS merchants | On public chains, MRR and big-client data are exposed to competitors; fully anonymous privacy coins can't be booked compliantly | Record model hides amounts and sources by default; View Key export plugs straight into Request Finance / Xero compliance audits |
| SaaS end users | Purchase history, wallet addresses and balances are public on-chain; traditional privacy wallets are hard to use | Transaction flows are shielded from outsiders by default; Embedded Wallet enables email one-click login to a privacy address |
| Developers | ZK circuit development is extremely complex (Leo code, prover performance tuning) | Stripe-like JS SDK and Hosted Checkout wrap the complex ZK logic in a few API calls |

## Core Features

1. **Developer Toolkit (SDK & API)**
   - **Hosted Checkout**: merchants skip frontend work — redirect to KethyrPay's hosted private checkout page.
   - **JS SDK**: `createPayment()` / `verifyPayment()` core APIs for embedding a pay button in merchant sites.
   - **Webhooks**: real-time push of payment success/failure and subscription events (`payment.secured`, `subscription.renewed`).

2. **Private Auto-Subscription Engine (Escrow Subscription Contract)**
   - ZK chains can't do traditional Web2 "silent pull payments", so we use a **private escrow smart contract**.
   - Users authorize once and pre-fund stablecoins (USAD / USDCx) into the private escrow contract, which releases amounts to the merchant on the subscription cadence until the balance runs out or the user cancels.

3. **Selective Compliance & Export (Compliant Auditor Dashboard)**
   - **Sender Ciphertext auto-decryption**: the merchant dashboard shows payer source addresses, satisfying AML fund-source tracing.
   - **Granular View Key grants**: generate standalone View Keys per statement and hand them to Request Finance or auditors.

## Current Demo North Star (fully real, not a mock)

```
Connect wallet → merchant mints invoice (create_invoice) → transfers to payer (transfer_invoice)
→ payer transfers (credits.aleo::transfer_public, real fund movement)
→ payer pays (pay_invoice, real ZK proof, invoice consumed only after transfer confirmed)
→ on-chain confirmation (verifyPayment) → merchant dashboard details → View Key statement export
```

> **Security invariant**: the flow transfers credits first and waits for on-chain
> confirmation (60s timeout), and only then signs `pay_invoice` to consume the
> invoice — eliminating the "consume invoice without paying" exploit.

## Highlights

| Feature | Description |
|---------|-------------|
| 🔒 Private checkout | On-chain PaymentRecord is ciphertext; amount/payer readable only via View Key |
| 💸 Real fund flow | Payments include a `credits.aleo::transfer_public` transfer; wallet balances really move |
| ⚖️ Compliance baseline | Sender Ciphertext commitment (a group element) is on-chain auditable; never touches a mixer |
| 🧾 Replay protection | InvoiceRecord.serial_number = BHP256 hash; each invoice can be paid exactly once |
| 📊 Merchant dashboard | Total collected + transaction details + RFC-4180 CSV / JSON statement export |
| ⚡ Performance tracing | prove / broadcast / confirm timing exported end to end |

## Architecture

```
contracts/pay_private/        Leo checkout contract pay_private_v2.aleo (deployed on Testnet)
contracts/escrow_subscription/ Leo private escrow subscription contract (POC: authorize / pull / cancel)
packages/sdk/                 @kethyrpay/sdk: createPayment / verifyPayment / invoice mint & transfer
frontend/demo/                TanStack Start + React 19: Checkout / Status / Merchant Dashboard
```

- Smart contracts: **Leo v4.4.1** (snarkVM 4.9.0)
- Proving: `@provablehq/sdk` browser WASM prover (client-side proving)
- Wallet adapters: `@provablehq/aleo-wallet-adaptor-*` (Shield Wallet by default)

## Run the Demo

### 1. Contracts (Leo 4.4.1)

```bash
cd contracts/pay_private && leo build && leo test   # 8/8
```

### 2. SDK

```bash
cd packages/sdk && pnpm install && pnpm build && pnpm test && pnpm typecheck
```

### 3. Frontend Demo

```bash
cd frontend/demo && pnpm install && pnpm dev   # http://localhost:3002
```

Configure the frontend `.env`:

```env
VITE_USE_REAL_TRANSACTIONS=true
VITE_RPC_ENDPOINT=https://api.explorer.provable.com/v1   # override when the default endpoint is unreachable
```

### Demo Walkthrough

```
Merchant wallet → /merchant/invoice mint & transfer invoice → "Open payment page" to Checkout
Payer wallet → Checkout pay (sign transfer_public first, confirm, then sign pay_invoice)
Payer wallet → status page confirms success (amount + both tx IDs) → "Merchant dashboard" link
Merchant wallet → /merchant for collection details + /merchant/export for statements
```

The browser needs the **Shield Wallet** extension on Testnet; the wallet must
authorize both `pay_private_v2.aleo` and `credits.aleo` (declared in code —
reconnect the wallet to apply).

## Roadmap

```
【 Phase 1: POC 】 ──> 【 Phase 2: MVP 】 ──> 【 Phase 3: PMF 】 ──> 【 Phase 4: Scaling 】
 (tech feasibility)      (core checkout live)    (subscription engine & ecosystem)  (platform & acceleration)
```

### Phase 1: POC (proof of concept) — ✅ Done

Validated browser WASM ZK proving speed and the math of the private escrow subscription contract.

- **Experimental Leo contract**: `escrow_subscription.aleo`, pre-authorized auto-drawdown (Escrow Pull Payment).
- **Browser perf benchmark**: prove time for one private stablecoin transfer on desktop Chrome and mainstream smartphones (Varuna proving system).
- **Double-spend & replay tests**: serial numbers / nullifiers generated off-chain and blocking double-spend.

**Success criteria**: proving ≤ 3s on desktop, ≤ 5s on mobile; ≥ 1,000 simulated concurrent testnet deductions with zero loss/double-spend.

### Phase 2: MVP (minimum viable product) — 🚧 In progress (current demo)

A gateway real merchants can test and actually receive one private stablecoin payment. No auto-renewal yet — single private checkout only.

- **Hosted Checkout**: a minimal hosted private payment page.
- **JS SDK v0.1**: `createPayment()` / `verifyPayment()` dual core APIs.
- **Merchant dashboard**: total collected + one-click View Key statement export.
- **Wallet compatibility**: one-click connect for mainstream Leo wallets (Shield Wallet by default).

**Success criteria**: 3–5 Web3 SaaS seed merchants in alpha; Request Finance View Key bill import; ≥ 100 real USAD/USDCx private transfers during the test period.

### Phase 3: PMF (product-market fit)

Ship the private auto-subscription engine, integrate Embedded Wallet to lower the barrier for regular users, and deliver a true Stripe-like experience.

- **Auto-subscription API**: escrow pre-authorized monthly auto-drawdown contract + APIs.
- **Embedded wallet integration**: email one-click login that derives an Aleo privacy wallet (Dynamic / Web3Auth).
- **Webhooks upgrade**: push merchant disconnect callbacks when a deduction fails due to insufficient balance.
- **Multi-stablecoin support**: full USDCx and USAD support.

**Success criteria**: 50+ merchants onboarded; subscription renewal failure rate < 10%; monthly private GPV > $1M.

### Phase 4: Scaling (platform & performance)

Optimize payment latency and device power draw; pursue global fiat compliance licensing.

- **Delegate Proving**: offload heavy ZK computation to cloud hardware via Compute Key; payment latency down to < 1s.
- **Cross-chain routing**: pay from ETH/USDT, auto-swap via a ZK bridge into Aleo privacy stablecoins in the merchant's treasury.
- **Fiat compliance gateway**: partner with regulated VASPs for one-click compliant off-ramps to bank accounts.

**Success criteria**: MSB/payment licenses in major jurisdictions; 95% of payments complete end-to-end within 1.5s (proof generation + verification).

## Key Technical Decisions

- **Proving strategy**: MVP firmly uses **client-side proving** (a few seconds slower, but minimal architecture and the highest security — keys never leave the device); Scaling phase adds **delegate proving** (Compute Key protects funds, better for mobile / weak networks).
- **Payment flow (compat-first → evolving)**: payments are currently **two transactions** — a `transfer_public` transfer confirmed on-chain first, then `pay_invoice` consuming the invoice to produce a private payment record (`pay_private_v2.aleo` focuses on proving & bookkeeping; Leo can't yet atomically transfer). Future: **private transfers** (`transfer_private`, hiding the payment amount) → **atomic** (transfer + consume inside one transaction). Either way, the **"transfer first, confirm, then consume"** invariant always holds.
- **Compliance baseline**: we never touch a mixer. Every transfer must carry a **Sender Ciphertext** so the recipient (and authorized regulators) can always learn the source of funds — the line KethyrPay won't cross to stay on the right side of regulators.

## Testnet Deployment

| Field | Value |
|-------|-------|
| Program ID | `pay_private_v2.aleo` |
| Deploy tx | `at1f6vzg6az4r2ztgxh5ctudhfcstdz42d2rgjzfuud60aut8lxeu8qldke5l` |
| Explorer | https://explorer.provable.com/program/pay_private_v2.aleo |
| v1 (legacy) | `pay_private.aleo` (no transfer_invoice, @noupgrade — can't be upgraded) |

## Docs

- Checkout contract design: [`contracts/pay_private/DESIGN.md`](contracts/pay_private/DESIGN.md)
- Checkout contract deployment: [`contracts/pay_private/DEPLOYMENT.md`](contracts/pay_private/DEPLOYMENT.md)
- Escrow subscription design: [`contracts/escrow_subscription/DESIGN.md`](contracts/escrow_subscription/DESIGN.md)
- Demo walkthrough: [`docs/DEMO_WALKTHROUGH.md`](docs/DEMO_WALKTHROUGH.md)
- SDK usage: [`packages/sdk/README.md`](packages/sdk/README.md)
- Demo app: [`frontend/demo/README.md`](frontend/demo/README.md)

## License

MIT
