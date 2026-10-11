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
    events::StreamCancelled,
    state::{CompanyConfig, PayrollStream},
};

#[derive(Accounts)]
#[instruction(stream_id: u64)]
pub struct CancelStream<'info> {
    /// 触发者：雇主或员工皆可签名（离职结算）。
    #[account(mut)]
    pub caller: Signer<'info>,

    /// 企业主账户，作为 company PDA 的种子来源。
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
        constraint = !stream.cancelled @ PayrollError::StreamCancelled,
    )]
    pub stream: Box<Account<'info, PayrollStream>>,

    /// 员工钱包（作为其 ATA 的 authority；`init_if_needed` 需真实账户）。
    #[account(address = stream.recipient @ PayrollError::Unauthorized)]
    pub recipient: SystemAccount<'info>,

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

    /// 员工净额收款 ATA（按需创建）。
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// 雇主退款 ATA（按需创建）。
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = employer,
        associated_token::token_program = token_program,
    )]
    pub employer_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = stream.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn cancel_stream(ctx: Context<CancelStream>, stream_id: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let (total, withdrawn, unlocked, claimable, rate, bump, recipient) = {
        let stream = &ctx.accounts.stream;
        (
            stream.total_amount,
            stream.withdrawn_amount,
            stream.compute_unlocked(now)?,
            stream.compute_claimable(now)?,
            stream.withholding_rate,
            stream.bump,
            stream.recipient,
        )
    };

    let caller = ctx.accounts.caller.key();
    let employer_key = ctx.accounts.employer.key();
    require!(
        caller == employer_key || caller == recipient,
        PayrollError::Unauthorized
    );

    let refund = total.checked_sub(unlocked).ok_or(PayrollError::MathOverflow)?;
    let (paid_net, paid_tax) = PayrollStream::split_withholding(claimable, rate)?;

    let company_key = ctx.accounts.company.key();
    let stream_id_bytes = stream_id.to_le_bytes();
    let seeds: &[&[u8]] = &[
        STREAM_SEED,
        company_key.as_ref(),
        &stream_id_bytes,
        &[bump],
    ];
    let signer_seeds = &[seeds];

    // 1) 已工作部分即时归员工（扣税）
    if paid_net > 0 {
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
            paid_net,
            ctx.accounts.mint.decimals,
        )?;
    }

    if paid_tax > 0 {
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
            paid_tax,
            ctx.accounts.mint.decimals,
        )?;
    }

    // 2) 未解锁部分退回雇主
    if refund > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.employer_ata.to_account_info(),
                    authority: ctx.accounts.stream.to_account_info(),
                },
                signer_seeds,
            ),
            refund,
            ctx.accounts.mint.decimals,
        )?;
    }

    let stream = &mut ctx.accounts.stream;
    stream.withdrawn_amount = withdrawn
        .checked_add(claimable)
        .ok_or(PayrollError::MathOverflow)?;
    stream.cancelled = true;

    emit!(StreamCancelled {
        stream: stream.key(),
        employer: employer_key,
        recipient,
        unlocked,
        paid_net,
        paid_tax,
        refunded: refund,
    });

    Ok(())
}
