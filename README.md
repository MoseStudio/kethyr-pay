# KethyrPay — Privacy-First Payment Gateway on Aleo

> **Aleo x OpenBuild APAC Hackathon · PAY Privacy Payment Track**

<div align="center">

**[简体中文](README.CN.md) · [English](README.md)**

</div>

## Promo Video

<video src="https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/Kethyrpay.mp4" controls width="100%" poster="https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/poster.jpg"></video>

[![KethyrPay promo video](https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/poster.jpg)](https://github.com/user-attachments/assets/d3f8729c-cce1-4d7c-b256-6e8a462c2eff)

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
Connect wallet → merchant mints invoice (mint_to_payer, owner = payer)
→ payer prepares a private ALEO record (transfer_public_to_private) → pay (pay_invoice atomic: transfer_private + consume InvoiceRecord + dual receipts, single tx, fully atomic)
→ on-chain confirmation (verifyPayment) → merchant dashboard details → View Key statement export
```

[![Demo Video](https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/poster.jpg)](https://github.com/user-attachments/assets/2ab3ed36-73cc-42c6-a566-243485adac8b)

> **Security invariant**: v3 is fully **atomic** — `transfer_private` + invoice consume + dual receipts execute in order within a single transaction; any failure reverts the whole tx, **eliminating any intermediate state**.

## Highlights

| Feature | Description |
|---------|-------------|
| 🔒 Private checkout | On-chain PaymentRecord is ciphertext; amount/payer readable only via View Key |
| 💸 Real fund flow | Single `pay_invoice` with `credits.aleo::transfer_private`; wallet balances really move |
| ⚖️ Compliance baseline | Sender Ciphertext commitment (a group element) is on-chain auditable; never touches a mixer |
| 🧾 Replay protection | InvoiceRecord.serial_number = BHP256 hash; each invoice can be paid exactly once |
| 📊 Merchant dashboard | Total collected + transaction details + RFC-4180 CSV / JSON statement export (ALEO) |
| ⚡ Performance tracing | prove / broadcast / confirm timing exported end to end (toggleable) |

## Architecture

```
contracts/pay_private/        Leo checkout contract pay_private_v2.aleo (legacy, replaced by v3)
contracts/pay_private_v3/     Leo checkout contract pay_private_v3.aleo (current Testnet deployment, atomic)
contracts/escrow_subscription/ Leo private escrow subscription contract (POC: authorize / pull / cancel)
packages/sdk/                 @kethyrpay/sdk: createPayment / verifyPayment / mint_to_payer
frontend/demo/                TanStack Start + React 19: Checkout / Status / Merchant Dashboard
```

- Smart contracts: **Leo v4.4.1** (snarkVM 4.9.0)
- Proving: `@provablehq/sdk` browser WASM prover (client-side proving)
- Wallet adapters: `@provablehq/aleo-wallet-adaptor-*` (Shield Wallet by default, auto-connect, declares pay_private_v3.aleo + credits.aleo)

## Run the Demo

### 1. Contracts (Leo 4.4.1)

```bash
cd contracts/pay_private && leo build && leo test   # v2 legacy 8/8
cd contracts/pay_private_v3 && leo build && leo test # v3 atomic
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
VITE_RPC_ENDPOINT=https://api.provable.com/v2/testnet   # optional RPC override
VITE_ENABLE_PERFORMANCE_PANEL=false   # show bottom-right perf panel (debug only)
```

CSRF middleware is enabled for server functions; see `src/start.ts`.

### Demo Walkthrough

```
Merchant wallet → /merchant/invoice mint & deliver (mint_to_payer single tx) → "Open payment page" to Checkout
Payer wallet → Checkout pay (single atomic pay_invoice: private ALEO + InvoiceRecord + dual receipts)
Payer wallet → status page confirms success (amount + tx ID) → "Merchant dashboard" link
Merchant wallet → /merchant for collection details + /merchant/export for statements
```

The browser needs the **Shield Wallet** extension on Testnet; the wallet must authorize both `pay_private_v3.aleo` and `credits.aleo` (declared in code — reconnect the wallet to apply).

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
- **Payment flow (v3 atomic)**: **Single `pay_invoice` is fully atomic** — `credits.aleo::transfer_private` + InvoiceRecord consume + dual receipts. V2 required two txs; v3 has eliminated the gap.
- **Compliance baseline**: we never touch a mixer. Every transfer must carry a **Sender Ciphertext** so the recipient (and authorized regulators) can always learn the source of funds — the line KethyrPay won't cross to stay on the right side of regulators.

## Testnet Deployment

| Field | Value |
|-------|-------|
| Program ID | `pay_private_v3.aleo` (current) |
| Deploy tx | `at1sq0xgyaqsx53k9eqkgexzu2njjpt66p4c0jzh566taqe6yj9nufqzre8wy` |
| Explorer | https://explorer.provable.com/program/pay_private_v3.aleo |
| Total fee | 10.849479 ALEO |
| v1 (legacy) | `pay_private.aleo` (no transfer_invoice, @noupgrade) |
| v2 (legacy) | `pay_private_v2.aleo` (single non-atomic payment, replaced by v3) |

## Docs

- Checkout contract design: [`contracts/pay_private_v3/DESIGN.md`](contracts/pay_private_v3/DESIGN.md) (current) / [`contracts/pay_private/DESIGN.md`](contracts/pay_private/DESIGN.md) (legacy)
- Checkout contract deployment: [`contracts/pay_private_v3/DEPLOYMENT.md`](contracts/pay_private_v3/DEPLOYMENT.md)
- Escrow subscription design: [`contracts/escrow_subscription/DESIGN.md`](contracts/escrow_subscription/DESIGN.md)
- Demo walkthrough: [`docs/DEMO_WALKTHROUGH.md`](docs/DEMO_WALKTHROUGH.md)
- SDK usage: [`packages/sdk/README.md`](packages/sdk/README.md)
- Demo app: [`frontend/demo/README.md`](frontend/demo/README.md)

## License

MIT
