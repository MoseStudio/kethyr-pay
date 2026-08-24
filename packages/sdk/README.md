# @kethyrpay/sdk

Official TypeScript SDK for integrating KethyrPay Aleo payments into web
applications. The package is distributed as an ESM library with TypeScript
declarations and keeps the Aleo runtime dependencies as peer dependencies so
the host application controls their versions.

> **Status:** The SDK is currently an early release (`0.1.1`) intended for
> Testnet integrations. Review the API and network configuration before using
> it in production.

## Features

- Idempotent Aleo SDK and WASM initialization.
- Framework-agnostic wallet adapter interface.
- Shield Wallet adapter with client-only loading.
- In-memory wallet adapter for development and tests.
- Invoice-to-payer minting and atomic `pay_invoice` transaction helpers.
- Payment intent creation and Testnet payment verification.
- Helpers for Aleo addresses, credits, records, and transaction options.

## Installation

```bash
pnpm add @kethyrpay/sdk
pnpm add @provablehq/sdk@^0.11.6 @provablehq/aleo-types \
  @provablehq/aleo-wallet-adaptor-core \
  @provablehq/aleo-wallet-adaptor-shield
```

The `@provablehq/aleo-wallet-adaptor-shield` peer dependency is optional when
using a different wallet adapter or the in-memory adapter.

## Quick start

The current v3 payment flow separates invoice delivery, private proving, and
settlement:

1. The merchant creates a `PaymentIntent`, then signs `mint_to_payer` with the
   intent's invoice ID to create an `InvoiceRecord` owned by the payer.
2. The checkout page obtains the payer's invoice and credits records from the
   wallet.
3. The wallet creates a local ZK proof and signs one atomic `pay_invoice`
   transaction.
4. The status page polls the Aleo Testnet RPC using the submitted transaction
   ID.

The SDK provides high-level `mintInvoiceToPayer()` and `payInvoice()` methods
for this flow. Both methods delegate to the same transaction builders used by
the hosted Demo and submit through the connected wallet.

For a browser checkout, initialize the SDK on the client and connect the
wallet before signing:

```ts
import { KethyrPay } from '@kethyrpay/sdk'

// Browser only: the default adapter loads Shield Wallet client-side.
const kethyrPay = await KethyrPay.create({ autoConnect: true })

const intent = await kethyrPay.createPayment({
  amount: '1.5',
  merchant: 'aleo1...merchant',
})

// These records are obtained from the payer wallet after mint_to_payer.
const transactionId = await kethyrPay.payInvoice({
  invoiceId: intent.invoice_id,
  amount: intent.amount,
  merchant: intent.merchant,
  invoiceRecord: payerInvoiceRecord,
  token: payerCreditsRecord,
  senderCiphertext: payerSenderCiphertext,
})

const status = await kethyrPay.verifyPayment(intent.invoice_id, {
  transactionId,
  expectedAmount: intent.amount,
  timeoutMs: 60_000,
})
```

`createPayment` returns a `PaymentIntent` containing the invoice ID, payment
URL, expiry, and transaction parameters. The transaction returned directly by
`createPayment` is a convenient intent/demo payload; a real v3 settlement must
include the payer's `InvoiceRecord` and `credits.aleo::credits` record as shown
above. `verifyPayment` polls the Aleo Testnet RPC endpoint and returns
`pending`, `confirmed`, or `failed`.
The default endpoint is `https://api.provable.com/v2/testnet`; configure
`KethyrPayOptions.rpcEndpoint` to use another endpoint.

### Merchant: mint an invoice to the payer

The merchant must first create the invoice record with `owner = payer`. The
preferred v3 path is one `mint_to_payer` transaction:

```ts
import { KethyrPay } from '@kethyrpay/sdk'

const pay = await KethyrPay.create({ autoConnect: true })
const merchant = pay.getPublicKey()!
const intent = await pay.createPayment({
  merchant,
  amount: '1.5',
})
await pay.mintInvoiceToPayer({
  merchant,
  payee: 'aleo1...payer',
  amount: intent.amount,
  invoiceId: intent.invoice_id,
})
```

After the transaction is confirmed and the payer wallet can see the
`InvoiceRecord`, the payer can execute the atomic `pay_invoice` flow above.
The legacy `create_invoice` plus `transfer_invoice` two-transaction path is
still exported for compatibility, but should not be used for new integrations.
For lower-level integrations, the underlying
`mintInvoiceToPayerTransaction` and `createPayInvoiceTransaction` builders
remain available.

### Server-side payment intent creation

Invoice creation only validates input and constructs transaction parameters;
it does not require a wallet signature. A server can use the memory adapter and
skip WASM initialization:

```ts
import {
  KethyrPay,
  createMemoryWalletAdapter,
} from '@kethyrpay/sdk'

const kethyrPay = await KethyrPay.create({
  wallet: createMemoryWalletAdapter,
  skipWasmInit: true,
  paymentBaseUrl: 'https://pay.example.com',
})

const intent = await kethyrPay.createPayment({
  amount: '1.5',
  merchant: 'aleo1...merchant',
  expiresInMs: 30 * 60 * 1000,
})
```

Persist the returned intent on the server and pass it to the checkout page.
Never expose private keys or wallet credentials to the server. The browser
wallet must sign and submit the transaction.

### Confirming a submitted transaction

After the wallet returns a transaction ID, pass the invoice ID to
`verifyPayment` from a client or server status endpoint:

```ts
const status = await kethyrPay.verifyPayment(intent.invoice_id, {
  transactionId: 'at1...transaction-id',
  expectedAmount: intent.amount,
  timeoutMs: 60_000,
  intervalMs: 2_000,
})
```

When a server-side status endpoint does not need WASM or a browser wallet, use
`skipWasmInit: true` together with `wallet: createMemoryWalletAdapter`, and
provide the transaction lookup through the configured RPC endpoint.

## Public API

The main exports include:

- `KethyrPay` and `KethyrPayOptions`
- `PaymentIntent`, `PaymentStatus`, and payment parameter types
- `WalletAdapter`, `createShieldAdapter`, and `createMemoryWalletAdapter`
- `mintInvoiceToPayer()` and `payInvoice()` for the complete v3 payment flow
- `createPayInvoiceTransaction` and payment verification helpers
- Aleo account, address, record, encoding, and transaction helpers

See the generated TypeScript declarations in `dist/` for the complete
signature reference.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

`npm publish` runs the build and test suite automatically through the
`prepublishOnly` lifecycle script. The package is published under the MIT
license; see [`LICENSE`](./LICENSE).

## Links

- Repository: https://github.com/MoseStudio/kethyr-pay
- Issues: https://github.com/MoseStudio/kethyr-pay/issues
