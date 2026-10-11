# KethyrPay — Streaming Payroll & Treasury on Solana

> **Colosseum Hackathon · Solana Track**

**Live demo (devnet):** <https://kethyrpay.suseayah.workers.dev/payroll> · [Judge walkthrough](docs/DEMO_DEVNET.md)

<div align="center">

**[English](README.md) · [简体中文](README.CN.md)**

</div>

---

Salary is not a monthly event — it accrues continuously. **KethyrPay** turns payroll into a
continuously-accruing claim on a Solana program:

- The employer funds a stream **once**; the principal sits in a program-owned vault.
- The employee's balance **unlocks linearly with time**, from a pure formula.
- They withdraw whenever they want. Tax is withheld and routed to the company's tax vault
  **atomically, in the same instruction**.
- **No per-second transactions.** Settlement is lazy — on-chain state changes only when someone
  claims, so a stream costs the same whether it runs for an hour or a year.

---

## Table of contents

- [The problem](#the-problem)
- [How it works](#how-it-works)
- [On-chain reference](#on-chain-reference)
- [Frontend](#frontend)
- [Repository layout](#repository-layout)
- [Devnet deployment](#devnet-deployment)
- [Run it locally](#run-it-locally)
- [Judge walkthrough](#judge-walkthrough)
- [Verification](#verification)
- [Roadmap](#roadmap)
- [Limitations (honest notes)](#limitations-honest-notes)

---

## The problem

| Who | Problem | KethyrPay |
|---|---|---|
| Employer | Payroll is a monthly batch job: money moves after the work, not with it | Fund once, let the balance accrue second by second |
| Employee | Waiting 30 days for earned money; cash-flow whiplash | Withdraw any amount, any time, down to the second |
| Finance / tax | Withholding is computed in spreadsheets, decoupled from the payment | Tax is split and routed to a reserved treasury **inside the same transaction** |
| Remote / cross-border teams | Settlement latency measured in days | Settlement is one signature, whenever the employee wants it |
| Offboarding | "Worked-but-unpaid" disputes | `cancel_stream` settles the worked portion and refunds the rest, deterministically |

## How it works

### 1. Company setup — `initialize_company`

The employer creates a `CompanyConfig` PDA and a **tax vault** (an ATA owned by that PDA).
The company is bound to one payroll mint and one default withholding rate (bps, `1500` = 15%).

### 2. Stream creation — `create_stream`

The employer passes `stream_id`, `total_amount`, `start_time`, `end_time`, `withholding_rate`.
The instruction creates a `PayrollStream` PDA plus a **vault** (an ATA owned by the stream PDA)
and moves the entire principal into it. From then on the money is not the employer's — it is
committed.

### 3. Continuous accrual — pure math, no transactions

```
duration = end_time - start_time
unlocked = min(total, total × (now - start_time) / duration)     // 0 before start, total after end
claimable = unlocked - withdrawn_amount
```

`now` is the on-chain `Clock` unix timestamp. All intermediates use `u128`, so a `u64` total can
never overflow. This is *deterministic vesting*: the balance is a function of time, not of who
calls what. The frontend evaluates the same formula locally every animation frame, which is what
makes the balance tick without a single RPC round-trip.

### 4. Claim — `claim_stream` (atomic withholding)

```
tax = claimable × withholding_rate / 10_000
net = claimable - tax
```

Two `transfer_checked` CPIs in one instruction: `net` → the employee, `tax` → the company tax
vault. `withdrawn_amount += claimable`. Either both transfers happen or the transaction reverts —
there is no intermediate state where the employee is paid but the tax is not withheld.

### 5. Terminate & settle — `cancel_stream`

Callable by **either** party (resignation, dispute, offboarding). It pays out everything accrued
so far (with withholding) and refunds `total − unlocked` to the employer, then marks the stream
cancelled. `close_stream` afterwards reclaims the vault + account rent.

## On-chain reference

Program: `programs/kethyr-payroll` · Anchor **0.32.x** · Rust 2021

### Accounts

| Account | Seeds | Holds |
|---|---|---|
| `CompanyConfig` | `[b"company", authority]` | authority, payroll mint, tax vault, auditor, default withholding rate, stream count |
| `PayrollStream` | `[b"stream", company, stream_id_le]` | employer, recipient, mint, vault, `total_amount`, `withdrawn_amount`, `start_time`, `end_time`, `withholding_rate`, `cancelled` |
| vault | `ATA(stream PDA, mint, token_program)` | the stream principal |
| tax vault | `ATA(company PDA, mint, token_program)` | withheld tax, reserved for the company |

### Instructions

| Instruction | Args | Notes |
|---|---|---|
| `initialize_company` | `withholding_rate: u16, auditor: pubkey` | creates config + tax vault |
| `update_company` | `withholding_rate: u16, auditor: pubkey` | authority only |
| `create_stream` | `stream_id: u64, total_amount: u64, start_time: i64, end_time: i64, withholding_rate: u16` | funds the vault in the same tx |
| `claim_stream` | `stream_id: u64` | employee-only; atomic net/tax split |
| `cancel_stream` | `stream_id: u64` | employer **or** employee; settle + refund |
| `close_stream` | `stream_id: u64` | cancelled & empty vault only; reclaims rent |

Program IDL: `frontend/demo/src/lib/solana/kethyr_payroll.idl.json` (regenerate with
`anchor build && cd frontend/demo && pnpm sync-idl`). Deeper notes:
[`programs/kethyr-payroll/README.md`](programs/kethyr-payroll/README.md).

### Token compatibility

All token movements go through `anchor_spl::token_interface` with `transfer_checked`, and the
program derives the vault with
`get_associated_token_address_with_program_id(..., token_program)`. The same program therefore
works with **classic SPL Token and Token-2022** mints — the token program is passed in, not
hard-coded.

### Errors

`InvalidTimeRange` · `InvalidWithholdingRate` · `InvalidAmount` · `NothingToClaim` ·
`StreamCancelled` · `StreamNotCancelled` · `Unauthorized` · `MathOverflow` · `VaultNotEmpty`

### Events

`CompanyInitialized` · `CompanyUpdated` · `StreamCreated` · `Claimed` · `StreamCancelled` · `StreamClosed`

## Frontend

Two surfaces, deliberately different products:

| Route | Who | What |
|---|---|---|
| `/payroll` | Employer | company setup, tax settings, create streams, live list of streams, treasury balance |
| `/payroll/employee` | Employee | standalone portal (not an admin shell): the ticking balance meter and one-click Claim |

- **Water meter**: `requestAnimationFrame` interpolation (`src/lib/solana/vesting.ts` is pure,
  dependency-free and unit-tested) feeds [NumberFlow](https://number-flow.barvian.me) for
  digit-by-digit rolling instead of text replacement.
- **Wallet**: Phantom, loaded client-side only. Solana SDK chunks are `lazy()`-imported so they
  never enter the SSR (Cloudflare Worker) module graph.
- **Stack**: TanStack Start + React 19 + Tailwind v4, deployed as a Cloudflare Worker.

## Repository layout

```text
Anchor.toml                     Anchor workspace
programs/kethyr-payroll/        the Solana program (this project)
frontend/demo/                  TanStack Start dApp (employer console + employee portal)
scripts/localnet-fund.sh        fund any address on a local validator (SOL + ATA + tokens)
scripts/localnet-smoke.mjs      chain smoke test — asserts the protocol invariants (13 checks)
scripts/devnet-setup.sh         one-shot devnet prep: deploy, mint, fund demo wallets
docs/DEMO_DEVNET.md             judge-facing walkthrough
```

## Devnet deployment

| | |
|---|---|
| Program | `Afm1YLnn7WBqbGgBvtxt8GMdV4LbogNqkhbtErXouP4v` |
| Payroll mint | `FZajpoDvjLbpdeK2CvcdGmg1wGqcWrVYqvYC2thFcp8m` (6 decimals) |
| Explorer | `https://explorer.solana.com/address/<address>?cluster=devnet` |
| App | <https://kethyrpay.suseayah.workers.dev/payroll> |

## Run it locally

Prerequisites: Rust + `anchor` 0.32, Solana CLI, `spl-token`.

```bash
# 1. local validator
solana-test-validator --reset

# 2. build & deploy the program
anchor build
anchor deploy --provider.cluster localnet

# 3. create a test mint, then point the frontend at it
spl-token create-token --decimals 6 --url http://127.0.0.1:8899   # copy the address
#   → frontend/demo/.env:  VITE_PAYROLL_MINT=<mint>

# 4. fund two wallets (helps you test employer + employee)
sh scripts/localnet-fund.sh <EMPLOYER_WALLET>
sh scripts/localnet-fund.sh <EMPLOYEE_WALLET>

# 5. run the app
cd frontend/demo && pnpm install && pnpm dev     # http://localhost:3002
```

`pnpm dev` reads `frontend/demo/.env` (localnet); `pnpm build` reads
`frontend/demo/.env.production` (devnet). The RPC endpoint is injected at build time, e.g.
`VITE_SOLANA_RPC=… pnpm build`, and falls back to the public devnet endpoint when unset.

### Test the protocol without a browser

```bash
cd frontend/demo && node ../../scripts/localnet-smoke.mjs
# against devnet:
cd frontend/demo && SOLANA_RPC=https://api.devnet.solana.com node ../../scripts/localnet-smoke.mjs
```

The smoke test creates a stream, claims it, cancels it, and asserts the numbers: the tax split,
`net + tax == claimed`, vault depletion, fund conservation, and the two expected failures
(`StreamCancelled` 6004, `NothingToClaim` 6003).

## Judge walkthrough

The full, step-by-step version (with the pre-funded demo wallets) is in
[`docs/DEMO_DEVNET.md`](docs/DEMO_DEVNET.md). The short version:

1. Switch Phantom to **Devnet**, import the demo wallets provided at the booth.
2. As **Employer** → `/payroll` → initialize the company → create a stream of `100` tokens
   ending **60 seconds** from now, rate `1500` (= 15%).
3. Watch the employee portal (`/payroll/employee`) tick, then hit **Claim**: the net amount lands
   in the employee wallet and exactly 15% lands in the company tax vault.
4. Back as Employer, hit **Terminate & settle** before the end time: the worked portion is paid
   out and the unearned remainder is refunded.

## Verification

- `anchor build` — no warnings, no SBF stack-frame violations
- `scripts/localnet-smoke.mjs` — **13/13** invariant checks (also runnable against devnet)
- `pnpm test` in `frontend/demo` — **127** unit tests (vesting math, formatting, token parsing, …)
- `pnpm typecheck` / `pnpm lint` — clean
- Real-Chromium pass over every route (no page/console errors) and the production build

## Roadmap

1. **Compliance-grade privacy** — issue a **per-company Token-2022 mint** with the
   `ConfidentialTransferMint` extension and a company **auditor** ElGamal key: transfer amounts
   become ElGamal ciphertexts, hidden from third parties, but decryptable by the tax auditor.
   (The program already moves tokens through `token_interface`, so the token program is a
   parameter already.)
2. **Hide the schedule too** — today `PayrollStream` stores `total_amount` / `withholding_rate` /
   `start_time` / `end_time` in plaintext, so an observer can derive gross pay even if amounts are
   encrypted. Next step: store a commitment and prove the unlocked amount in-circuit.
3. Metadata privacy (relayer / paymaster so the employer→employee graph is not public), streaming
   vaults that earn yield while idle, multi-token payroll, and a mainnet deployment.

## Limitations (honest notes)

- **Amounts are public today.** `PayrollStream` and the vault are ordinary accounts: anyone can
  read a stream and derive an employee's gross pay. Confidential transfers (roadmap #1) hide
  *amounts*; hiding the *schedule* needs roadmap #2. We would rather state this than imply privacy
  we have not shipped.
- One payroll mint per company (`CompanyConfig`), by design — it is also what makes a per-company
  auditor key possible.
- Settlement granularity is one second (the `Clock` sysvar).
- `claim_stream` pays only `claimable`; calling it when nothing has accrued returns
  `NothingToClaim` by design.

## License

MIT
