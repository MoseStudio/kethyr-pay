# KethyrPay — frontend (TanStack Start on Cloudflare Workers)

The web app for **KethyrPay**'s streaming payroll on Solana. Two surfaces:

| Route | Who | What |
|---|---|---|
| `/` | — | landing: links to both surfaces |
| `/payroll` | Employer | company setup, tax rate, create streams, live stream list, treasury balance |
| `/payroll/employee` | Employee | standalone portal: the ticking balance meter + one-click Claim |

The balance is computed locally from the same formula the program uses
(`unlocked = total × (now − start) / (end − start)`), so the meter ticks every frame
without polling the chain; on-chain state changes only when someone claims.

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:3002
```

`pnpm dev` reads `.env` (localnet by default — see `.env.example`). Point
`VITE_PAYROLL_MINT` at a mint you created with `spl-token create-token --decimals 6`,
and fund a couple of wallets with `../scripts/localnet-fund.sh`.

## Production build & deploy

```bash
pnpm build        # reads .env.production (devnet)
pnpm deploy       # build + wrangler deploy
```

`wrangler.jsonc` defines the Worker (`kethyrpay`). The Solana RPC endpoint is **not**
committed — inject it at build time (falls back to the public devnet endpoint):

```bash
VITE_SOLANA_RPC='https://devnet.helius-rpc.com/?api-key=<KEY>' pnpm build
```

## Checks

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # oxlint
pnpm test         # vitest (vesting math, formatting, token parsing)
```

## Layout

```text
src/
├── routes/                    # file-based routes (/, /payroll, /payroll/employee)
├── components/payroll/        # employer console, employee portal, stream card, animated amounts
├── contexts/SolanaProvider.tsx# client-only Phantom provider (SSR-safe fallback)
├── hooks/                     # Anchor client, stream subscription, rAF water meter, mint info
└── lib/solana/                # PDA derivations + pure, unit-tested vesting math
```

Anchor SDK chunks are `lazy()`-imported so they never enter the SSR (Cloudflare Worker)
module graph.
