use anchor_lang::prelude::*;

#[event]
pub struct CompanyInitialized {
    pub company: Pubkey,
    pub authority: Pubkey,
    pub tax_vault: Pubkey,
    pub withholding_rate: u16,
}

#[event]
pub struct CompanyUpdated {
    pub company: Pubkey,
    pub withholding_rate: u16,
    pub auditor: Pubkey,
}

#[event]
pub struct StreamCreated {
    pub stream: Pubkey,
    pub company: Pubkey,
    pub employer: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub total_amount: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub withholding_rate: u16,
    pub stream_id: u64,
}

#[event]
pub struct Claimed {
    pub stream: Pubkey,
    pub recipient: Pubkey,
    pub unlocked: u64,
    pub net_amount: u64,
    pub tax_amount: u64,
    pub withdrawn: u64,
}

#[event]
pub struct StreamCancelled {
    pub stream: Pubkey,
    pub employer: Pubkey,
    pub recipient: Pubkey,
    pub unlocked: u64,
    pub paid_net: u64,
    pub paid_tax: u64,
    pub refunded: u64,
}

#[event]
pub struct StreamClosed {
    pub stream: Pubkey,
    pub employer: Pubkey,
}
