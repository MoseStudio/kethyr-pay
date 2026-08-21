// Plain source strings for the payflow scene. The shared tokenizer
// (src/shared/highlight.ts) turns these into colored tokens, so author them
// as real code, never as hand-tagged token tuples.
//
// Snippets mirror the real @kethyrpay/sdk public API (packages/sdk/src).
// Current demo settles in the native Aleo token (ALEO, via credits.aleo);
// future USDC etc. switch only the currency string.

export const FLOW_CODE = `import { KethyrPay } from "@kethyrpay/sdk";

const pay = await KethyrPay.create();

// merchant mints invoice to payer (single tx)
await pay.mintInvoiceToPayer({
  merchant: "aleo1cdsz2pd...",
  payee: "aleo1payer...",
  amount: "1.50",
});

const intent = await pay.createPayment({
  merchant: "aleo1cdsz2pd...",
  amount: "1.50",
  currency: "ALEO",
});

// real ZK proof generated in the browser
// private keys never leave the wallet
// pay_invoice atomic: transfer_private + receipts

await pay.verifyPayment(intent.id);`;
