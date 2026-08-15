// Plain source strings for the payflow scene. The shared tokenizer
// (src/shared/highlight.ts) turns these into colored tokens, so author them
// as real code, never as hand-tagged token tuples.
//
// Snippets mirror the real @kethyrpay/sdk public API (packages/sdk/src).
// Amounts support both stablecoins (USD) and the native Aleo token (aleo).

export const FLOW_CODE = `import { KethyrPay } from "@kethyrpay/sdk";

const pay = await KethyrPay.create();

const intent = await pay.createPayment({
  merchant: "aleo1cdsz2pd...",
  amount: "120.50",
  currency: "USD", // or "aleo"
});

// real ZK proof generated in the browser
// private keys never leave the wallet

await pay.verifyPayment(intent.id);`;
