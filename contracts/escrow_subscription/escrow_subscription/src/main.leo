struct SerialInput {
    subscriber: address,
    merchant: address,
    total_amount: u64,
    interval: u32,
}

program escrow_subscription.aleo {
    record EscrowRecord {
        owner: address,
        merchant: address,
        total_amount: u64,
        remaining_amount: u64,
        interval: u32,
        created_at: u32,
        last_charged_at: u32,
        serial_number: field,
    }

    record PaymentRecord {
        owner: address,
        merchant: address,
        amount: u64,
        period: u32,
        escrow_serial_reference: field,
    }

    @noupgrade
    constructor() {}

    fn authorize_subscription(merchant: address, total_amount: u64, interval: u32) -> EscrowRecord {
        assert(total_amount > 0u64);
        assert(interval > 0u32);

        let subscriber: address = self.signer;
        let input: SerialInput = SerialInput {
            subscriber: subscriber,
            merchant: merchant,
            total_amount: total_amount,
            interval: interval,
        };
        let serial: field = BHP256::hash_to_field(input);

        return EscrowRecord {
            owner: subscriber,
            merchant: merchant,
            total_amount: total_amount,
            remaining_amount: total_amount,
            interval: interval,
            created_at: 0u32,
            last_charged_at: 0u32,
            serial_number: serial,
        };
    }

    fn pull_payment(escrow: EscrowRecord, amount: u64) -> (EscrowRecord, PaymentRecord) {
        assert_eq(escrow.merchant, self.signer);
        assert(amount > 0u64);
        assert(escrow.remaining_amount >= amount);

        let period: u32 = (escrow.last_charged_at - escrow.created_at) / escrow.interval + 1u32;
        let new_last_charged_at: u32 = escrow.last_charged_at + escrow.interval;
        let new_remaining: u64 = escrow.remaining_amount - amount;

        let updated_escrow: EscrowRecord = EscrowRecord {
            owner: escrow.owner,
            merchant: escrow.merchant,
            total_amount: escrow.total_amount,
            remaining_amount: new_remaining,
            interval: escrow.interval,
            created_at: escrow.created_at,
            last_charged_at: new_last_charged_at,
            serial_number: escrow.serial_number,
        };

        let payment: PaymentRecord = PaymentRecord {
            owner: escrow.merchant,
            merchant: escrow.merchant,
            amount: amount,
            period: period,
            escrow_serial_reference: escrow.serial_number,
        };

        return (updated_escrow, payment);
    }

    fn cancel_subscription(escrow: EscrowRecord) -> u64 {
        assert_eq(escrow.owner, self.signer);
        return escrow.remaining_amount;
    }
}
