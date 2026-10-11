use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        self, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::{
    constants::{COMPANY_SEED, STREAM_SEED},
    error::PayrollError,
    events::Claimed,
    state::{CompanyConfig, PayrollStream},
};

#[derive(Accounts)]
#[instruction(stream_id: u64)]
pub struct ClaimStream<'info> {
    /// 员工：签名，net 收入归属，并可代付 ATA 租金。
    #[account(mut)]
    pub recipient: Signer<'info>,

    /// 企业主账户，仅作为 company PDA 的种子来源（= company.authority）。
    #[account(address = company.authority @ PayrollError::Unauthorized)]
    pub employer: SystemAccount<'info>,

    #[account(
        seeds = [COMPANY_SEED, employer.key().as_ref()],
        bump = company.bump,
    )]
    pub company: Account<'info, CompanyConfig>,

    #[account(
        mut,
        seeds = [STREAM_SEED, company.key().as_ref(), &stream_id.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.recipient == recipient.key() @ PayrollError::Unauthorized,
        constraint = !stream.cancelled @ PayrollError::StreamCancelled,
    )]
    pub stream: Box<Account<'info, PayrollStream>>,

    #[account(mut, address = company.tax_vault)]
    pub tax_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        address = anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &stream.key(),
            &stream.mint,
            token_program.key,
        ),
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = recipient,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = stream.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim_stream(ctx: Context<ClaimStream>, stream_id: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let (claimable, unlocked, rate, bump) = {
        let stream = &ctx.accounts.stream;
        (
            stream.compute_claimable(now)?,
            stream.compute_unlocked(now)?,
            stream.withholding_rate,
            stream.bump,
        )
    };

    require!(claimable > 0, PayrollError::NothingToClaim);

    let (net_amount, tax_amount) = PayrollStream::split_withholding(claimable, rate)?;

    let company_key = ctx.accounts.company.key();
    let recipient_key = ctx.accounts.recipient.key();
    let stream_id_bytes = stream_id.to_le_bytes();
    let seeds: &[&[u8]] = &[
        STREAM_SEED,
        company_key.as_ref(),
        &stream_id_bytes,
        &[bump],
    ];
    let signer_seeds = &[seeds];

    // net → 员工 ATA
    if net_amount > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_ata.to_account_info(),
                    authority: ctx.accounts.stream.to_account_info(),
                },
                signer_seeds,
            ),
            net_amount,
            ctx.accounts.mint.decimals,
        )?;
    }

    // tax → 企业税务金库
    if tax_amount > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.tax_vault.to_account_info(),
                    authority: ctx.accounts.stream.to_account_info(),
                },
                signer_seeds,
            ),
            tax_amount,
            ctx.accounts.mint.decimals,
        )?;
    }

    let stream = &mut ctx.accounts.stream;
    stream.withdrawn_amount = stream
        .withdrawn_amount
        .checked_add(claimable)
        .ok_or(PayrollError::MathOverflow)?;

    emit!(Claimed {
        stream: stream.key(),
        recipient: recipient_key,
        unlocked,
        net_amount,
        tax_amount,
        withdrawn: stream.withdrawn_amount,
    });

    Ok(())
}
