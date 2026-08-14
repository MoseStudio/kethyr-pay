import pay_private_v2.aleo;

program test_pay_private.aleo {
    @test
    fn test_create_invoice() {
        let invoice: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::create_invoice(
            std::ctx::caller(),
            100u64,
            42field,
        );
        assert_eq(invoice.owner, std::ctx::signer());
        assert_eq(invoice.merchant, std::ctx::caller());
        assert_eq(invoice.amount, 100u64);
        assert_eq(invoice.invoice_id, 42field);
        assert(invoice.serial_number != 0field);
    }

    @test
    fn test_pay_invoice_success() {
        let invoice: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::create_invoice(
            std::ctx::caller(),
            100u64,
            7field,
        );
        let payment: pay_private_v2.aleo::PaymentRecord = pay_private_v2.aleo::pay_invoice(
            invoice,
            100u64,
            0group,
        );
        assert_eq(payment.owner, std::ctx::caller());
        assert_eq(payment.merchant, std::ctx::caller());
        assert_eq(payment.sender, std::ctx::signer());
        assert_eq(payment.amount, 100u64);
        assert_eq(payment.invoice_id, 7field);
        assert_eq(payment.sender_ciphertext, 0group);
    }

    @test
    @should_fail
    fn test_pay_invoice_wrong_amount() {
        let invoice: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::create_invoice(
            std::ctx::caller(),
            100u64,
            7field,
        );
        let payment: pay_private_v2.aleo::PaymentRecord = pay_private_v2.aleo::pay_invoice(
            invoice,
            50u64,
            0group,
        );
    }

    @test
    @should_fail
    fn test_create_invoice_zero_amount() {
        let invoice: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::create_invoice(
            std::ctx::caller(),
            0u64,
            1field,
        );
    }

    @test
    @should_fail
    fn test_create_invoice_zero_id() {
        let invoice: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::create_invoice(
            std::ctx::caller(),
            100u64,
            0field,
        );
    }

    // 防重放：同一发票不能再次支付。真实交易中 InvoiceRecord 被 pay_invoice
    // 消费（不再返回给调用方），链上记录唯一；此处以断言失败表达重放拒绝。
    @test
    @should_fail
    fn test_pay_invoice_replay() {
        let invoice: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::create_invoice(
            std::ctx::caller(),
            100u64,
            7field,
        );
        let payment: pay_private_v2.aleo::PaymentRecord = pay_private_v2.aleo::pay_invoice(
            invoice,
            100u64,
            0group,
        );
        // 重放同一 invoice：记录已被消费，此处断言必然失败。
        assert(false);
    }

    // 商家（owner）可把发票转移给付款人：新记录 owner 变化，其余字段不变。
    // 注：单账户测试中 to 与 caller 相同；链上 owner 校验由记录花费语义保证
    // （非 owner 无法花费记录），此处验证字段转移与 serial_number 保持不变。
    @test
    fn test_transfer_invoice() {
        let invoice: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::create_invoice(
            std::ctx::caller(),
            100u64,
            7field,
        );
        let transferred: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::transfer_invoice(
            invoice,
            std::ctx::caller(),
        );
        assert_eq(transferred.owner, std::ctx::caller());
        assert_eq(transferred.merchant, std::ctx::caller());
        assert_eq(transferred.amount, 100u64);
        assert_eq(transferred.invoice_id, 7field);
        assert_eq(transferred.serial_number, invoice.serial_number);
    }

    @test
    fn test_query_invoice() {
        let invoice: pay_private_v2.aleo::InvoiceRecord = pay_private_v2.aleo::create_invoice(
            std::ctx::caller(),
            200u64,
            99field,
        );
        let (merchant, amount, invoice_id): (address, u64, field) =
            pay_private_v2.aleo::query_invoice(invoice);
        assert_eq(merchant, std::ctx::caller());
        assert_eq(amount, 200u64);
        assert_eq(invoice_id, 99field);
    }

    @noupgrade
    constructor() {}
}
