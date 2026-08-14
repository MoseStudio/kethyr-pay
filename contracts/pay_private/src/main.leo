// AleoPay pay_private.aleo
// 单次隐私收单合约（黑客松 Demo 主路径）
//
// 设计要点：
// - InvoiceRecord：商家创建的收款发票（owner = 商家），serial_number 由
//   (merchant, amount, invoice_id) 哈希唯一确定，用作防重放锚点。
// - PaymentRecord：付款人支付后产出的收款记录（owner = 商家），携带
//   sender 地址与 sender_ciphertext（付款人公钥承诺，商家可用 View Key
//   解密确认付款人身份，合规底线）。
// - 防重放：pay_invoice 消费 InvoiceRecord（不再返回），并校验
//   amount == invoice.amount，同一发票仅能成功支付一次。

struct SerialInput {
    merchant: address,
    amount: u64,
    invoice_id: field,
}

program pay_private_v2.aleo {
    record InvoiceRecord {
        owner: address,
        merchant: address,
        amount: u64,
        invoice_id: field,
        serial_number: field,
    }

    record PaymentRecord {
        owner: address,
        merchant: address,
        sender: address,
        sender_ciphertext: group,
        amount: u64,
        invoice_id: field,
    }

    @noupgrade
    constructor() {}

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

    // 付款人支付发票：金额必须与发票一致；产出给商家的 PaymentRecord，
    // 并消费（销毁）InvoiceRecord 实现「同一发票仅支付一次」。
    fn pay_invoice(invoice: InvoiceRecord, amount: u64, sender_ciphertext: group) -> PaymentRecord {
        assert_eq(invoice.amount, amount);
        assert(amount > 0u64);

        return PaymentRecord {
            owner: invoice.merchant,
            merchant: invoice.merchant,
            sender: std::ctx::signer(),
            sender_ciphertext: sender_ciphertext,
            amount: amount,
            invoice_id: invoice.invoice_id,
        };
    }

    // 商家（发票 owner）把 InvoiceRecord 转移给付款人，使付款人能调用 pay_invoice。
    // 仅当前 owner 可转移（记录花费语义 + 显式断言双重保障）。
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
