# pay_private.aleo

AleoPay 单次隐私收单合约（黑客松 Demo 主路径，ALEO-MVP-002）。

## 函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `create_invoice` | `(merchant: address, amount: u64, invoice_id: field) -> InvoiceRecord` | 商家创建一次性收款发票 |
| `pay_invoice` | `(invoice: InvoiceRecord, amount: u64, sender_ciphertext: group) -> PaymentRecord` | 付款人支付，产出含 Sender Ciphertext 的收款记录 |
| `query_invoice` | `(invoice: InvoiceRecord) -> (address, u64, field)` | 链下只读查询 |

详见 [DESIGN.md](./DESIGN.md)。
