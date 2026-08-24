# Deployment Log — pay_private.aleo

## ALEO-MVP-003 Status

**Result:** ✅ Deployed to Aleo Testnet

### Deployment Info

| Field | Value |
|-------|-------|
| Network | testnet |
| Program ID | `pay_private.aleo` |
| Deployer Address | `aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69` |
| Transaction ID | `at1qzvp66car0svdftp58ds4tk05svalmzearqpgn5ude2htdqhjqxq0phrmg` |
| Fee Transaction ID | `at1ahgwpvqfxyxys233za6wtqaw5rjlz9twarzvww0dasp9ynscnvys9selwe` |
| Endpoint | `https://api.provable.com/v2/testnet` |
| Total Fee | 6.731043 credits |
| Confirmed | ✅ Yes |

### Deployment Command Used

```bash
cd /home/moseyah/code/kethyr/contracts/pay_private
leo deploy --network testnet --broadcast --yes --json-output=deploy-output.json
```

> ⚠️ **重要**：必须使用 **Leo CLI v4.4.1**（配套 snarkVM 4.9.0）部署。
> v4.3.2 的 base fee 估算（5.950980 credits）低于当前 testnet 节点要求
> （6.731043 credits），会被节点以 "insufficient base fee (deployment)" 拒绝。
> 升级方式：`leo update --name 'leo-lang v4.4.1'` 或手动下载
> [release 资产](https://github.com/ProvableHQ/leo/releases/tag/leo-lang-v4.4.1)。

### Program Functions

| 函数 | 签名 | 说明 |
|------|------|------|
| `create_invoice` | `(merchant: address, amount: u64, invoice_id: field) -> InvoiceRecord` | 商家创建一次性收款发票 |
| `pay_invoice` | `(invoice: InvoiceRecord, amount: u64, sender_ciphertext: group) -> PaymentRecord` | 付款人支付，产出含 Sender Ciphertext 的收款记录 |
| `query_invoice` | `(invoice: InvoiceRecord) -> (address, u64, field)` | 链下只读查询 |

### Records

- **InvoiceRecord**: `owner`, `merchant`, `amount`, `invoice_id`, `serial_number`
- **PaymentRecord**: `owner`, `merchant`, `sender`, `sender_ciphertext`, `amount`, `invoice_id`

### ABI

构建产物 ABI：`build/pay_private/abi.json`（`leo build` 自动生成）。

### Frontend Configuration

前端 SDK（`packages/sdk`）默认 `PROGRAM_ID = 'pay_private.aleo'`，与部署 ID 一致，无需修改。

### Explorer Links

- Transaction: `https://explorer.provable.com/transaction/at1qzvp66car0svdftp58ds4tk05svalmzearqpgn5ude2htdqhjqxq0phrmg`
- Program: `https://explorer.provable.com/program/pay_private.aleo`

> ⚠️ Security reminder: the `.env` file containing `PRIVATE_KEY` is gitignored and must never be committed.
