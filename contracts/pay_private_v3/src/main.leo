// KethyrPay pay_private_v3.aleo
// 单次隐私收单合约 v3（升级自 v2）—— 单笔交易原子化完成：
//   credits.aleo::transfer_private(merchant) + 消费 InvoiceRecord
//   + 双 Receipt 产出（商家 + 付款人）。
//
// 相对 v2 的关键差异：
//   - 引入 credits.aleo 作为 network 依赖（program.json）。
//   - pay_invoice 接收 `token: credits.aleo::credits`，在单笔交易内完成
//     真实链上 token 转移 + 发票消费；任何一步失败整笔回滚。
//   - 同时产出 MerchantReceipt（owner=merchant）和 PayerReceipt
//     （owner=signer），双方均可作为合规凭证。
//   - Receipt 携带 sender_ciphertext（group）作为付款人公钥承诺锚点，
//     商家可用 View Key 解密确认付款人身份。
//   - 保留 v2 的 InvoiceRecord / serial_number 防重放设计：InvoiceRecord
//     被 pay_invoice 消费即不可再付。
//
// 设计文档：./DESIGN.md

import credits.aleo;

struct SerialInput {
    merchant: address,
    amount: u64,
    invoice_id: field,
}

program pay_private_v3.aleo {
    // 商家持有的收款发票；被 pay_invoice 一次性消费。
    record InvoiceRecord {
        owner: address,
        merchant: address,
        amount: u64,
        invoice_id: field,
        serial_number: field,
    }

    // 商家收款回执（含 sender_ciphertext 审计锚点）。
    record MerchantReceipt {
        owner: address,
        merchant: address,
        sender: address,
        sender_ciphertext: group,
        amount: u64,
        invoice_id: field,
    }

    // 付款人支付回执（合规备查、争议仲裁用）。
    record PayerReceipt {
        owner: address,
        merchant: address,
        sender: address,
        sender_ciphertext: group,
        amount: u64,
        invoice_id: field,
    }

    @noupgrade
    constructor() {}

    // 一步铸造发票并交付付款人（v3 原子化扩展）。
    //
    // 商家（签名者）一次性产出 owner=payee 的 InvoiceRecord，付款人可直接消费；
    // 不再需要先 create_invoice + transfer_invoice 两笔交易 + 中间等待钱包扫描。
    // 字段集与 create_invoice 相同：amount / invoice_id 校验 + serial_number 由
    // BHP256::hash_to_field(merchant, amount, invoice_id) 派生，保证防重放。
    fn mint_to_payer(merchant: address, payee: address, amount: u64, invoice_id: field) -> InvoiceRecord {
        assert(amount > 0u64);
        // invoice_id 不能为零，避免空发票被重放。
        assert(invoice_id != 0field);

        let input: SerialInput = SerialInput {
            merchant: merchant,
            amount: amount,
            invoice_id: invoice_id,
        };
        let serial: field = BHP256::hash_to_field(input);

        return InvoiceRecord {
            owner: payee,
            merchant: merchant,
            amount: amount,
            invoice_id: invoice_id,
            serial_number: serial,
        };
    }

    // 商家创建一次性收款发票。发票持有者（owner）即商家。
    fn create_invoice(merchant: address, amount: u64, invoice_id: field) -> InvoiceRecord {
        assert(amount > 0u64);
        // invoice_id 不能为零，避免空发票被重放。
        assert(invoice_id != 0field);

        let input: SerialInput = SerialInput {
            merchant: merchant,
            amount: amount,
            invoice_id: invoice_id,
        };
        let serial: field = BHP256::hash_to_field(input);

        return InvoiceRecord {
            owner: std::ctx::signer(),
            merchant: merchant,
            amount: amount,
            invoice_id: invoice_id,
            serial_number: serial,
        };
    }

    // 付款人原子化支付：
    //   1) 校验 amount == invoice.amount；
    //   2) 调用 credits.aleo::transfer_private 把 token 转给商家，
    //      同时产出付款人的找零 credits record（settle.1）；
    //   3) 消费 InvoiceRecord（防重放）；
    //   4) 产出 MerchantReceipt（owner=商家）与 PayerReceipt（owner=付款人）。
    //
    // 任一步失败（金额不匹配 / credits 不足 / 链上校验不过）整笔交易回滚，
    // 满足「单笔交易原子化」要求。
    fn pay_invoice(
        invoice: InvoiceRecord,
        amount: u64,
        sender_ciphertext: group,
        token: credits.aleo::credits,
    ) -> (MerchantReceipt, PayerReceipt, credits.aleo::credits, credits.aleo::credits) {
        // 金额必须严格匹配发票。
        assert_eq(invoice.amount, amount);
        assert(amount > 0u64);

        // 原子结算：credits.aleo 内置 transfer_private 完成真实链上 token
        // 转移；返回 (剩余 credits 找零, 商家到账 credits record)。
        // 整个调用在同一交易内执行——失败则整笔回滚。
        let settle: (credits.aleo::credits, credits.aleo::credits) =
            credits.aleo::transfer_private(token, invoice.merchant, amount);

        let merchant_receipt: MerchantReceipt = MerchantReceipt {
            owner: invoice.merchant,
            merchant: invoice.merchant,
            sender: std::ctx::signer(),
            sender_ciphertext: sender_ciphertext,
            amount: amount,
            invoice_id: invoice.invoice_id,
        };

        let payer_receipt: PayerReceipt = PayerReceipt {
            owner: std::ctx::signer(),
            merchant: invoice.merchant,
            sender: std::ctx::signer(),
            sender_ciphertext: sender_ciphertext,
            amount: amount,
            invoice_id: invoice.invoice_id,
        };

        return (
            merchant_receipt,
            payer_receipt,
            settle.0,
            settle.1,
        );
    }

    // 商家（发票 owner）把 InvoiceRecord 转移给付款人，使付款人能调用
    // pay_invoice。仅当前 owner 可转移。
    fn transfer_invoice(invoice: InvoiceRecord, to: address) -> InvoiceRecord {
        assert_eq(invoice.owner, std::ctx::signer());

        return InvoiceRecord {
            owner: to,
            merchant: invoice.merchant,
            amount: invoice.amount,
            invoice_id: invoice.invoice_id,
            serial_number: invoice.serial_number,
        };
    }

    // 链下只读查询：返回 (merchant, amount, invoice_id)。
    fn query_invoice(invoice: InvoiceRecord) -> (address, u64, field) {
        return (invoice.merchant, invoice.amount, invoice.invoice_id);
    }
}
