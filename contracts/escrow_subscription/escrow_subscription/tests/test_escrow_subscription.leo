import escrow_subscription.aleo;

program test_escrow_subscription.aleo {
    @test
    fn test_authorize_subscription() {
        let escrow: escrow_subscription.aleo::EscrowRecord = escrow_subscription.aleo::authorize_subscription(
            self.caller,
            1000u64,
            10u32,
        );
        assert_eq(escrow.owner, self.signer);
        assert_eq(escrow.merchant, self.caller);
        assert_eq(escrow.total_amount, 1000u64);
        assert_eq(escrow.remaining_amount, 1000u64);
        assert_eq(escrow.interval, 10u32);
        assert_eq(escrow.created_at, 0u32);
        assert_eq(escrow.last_charged_at, 0u32);
    }

    @test
    fn test_pull_payment_success() {
        let escrow: escrow_subscription.aleo::EscrowRecord = escrow_subscription.aleo::authorize_subscription(
            self.caller,
            1000u64,
            10u32,
        );
        let (updated, payment): (escrow_subscription.aleo::EscrowRecord, escrow_subscription.aleo::PaymentRecord) =
            escrow_subscription.aleo::pull_payment(escrow, 100u64);
        assert_eq(updated.remaining_amount, 900u64);
        assert_eq(updated.last_charged_at, 10u32);
        assert_eq(payment.amount, 100u64);
        assert_eq(payment.period, 1u32);
        assert_eq(payment.merchant, self.caller);
        assert_eq(payment.escrow_serial_reference, escrow.serial_number);
    }

    @test
    @should_fail
    fn test_pull_payment_bad_merchant() {
        let other: address = aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc;
        let escrow: escrow_subscription.aleo::EscrowRecord = escrow_subscription.aleo::authorize_subscription(
            other,
            1000u64,
            10u32,
        );
        let (unused, discarded): (escrow_subscription.aleo::EscrowRecord, escrow_subscription.aleo::PaymentRecord) =
            escrow_subscription.aleo::pull_payment(escrow, 100u64);
    }

    @test
    @should_fail
    fn test_pull_payment_overdraw() {
        let escrow: escrow_subscription.aleo::EscrowRecord = escrow_subscription.aleo::authorize_subscription(
            self.caller,
            100u64,
            10u32,
        );
        let (unused, discarded): (escrow_subscription.aleo::EscrowRecord, escrow_subscription.aleo::PaymentRecord) =
            escrow_subscription.aleo::pull_payment(escrow, 200u64);
    }

    @test
    fn test_cancel_subscription_ok() {
        let escrow: escrow_subscription.aleo::EscrowRecord = escrow_subscription.aleo::authorize_subscription(
            self.caller,
            1000u64,
            10u32,
        );
        let remaining: u64 = escrow_subscription.aleo::cancel_subscription(escrow);
        assert_eq(remaining, 1000u64);
    }

    @noupgrade
    constructor() {}
}
