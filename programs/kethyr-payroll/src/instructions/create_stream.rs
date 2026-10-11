use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        self, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::{
    constants::{BPS_BASE, COMPANY_SEED, STREAM_SEED},
    error::PayrollError,
    events::StreamCreated,
    state::{CompanyConfig, PayrollStream},
};

#[derive(Accounts)]
#[instruction(stream_id: u64)]
pub struct CreateStream<'info> {
    /// 雇主 / 企业主，签名并支付金库租金与初始本金。
    #[account(mut)]
    pub employer: Signer<'info>,

    #[account(
        mut,
        seeds = [COMPANY_SEED, employer.key().as_ref()],
        bump = company.bump,
        has_one = authority @ PayrollError::Unauthorized,
    )]
    pub company: Account<'info, CompanyConfig>,

    /// 企业主账户，仅用于 `has_one = authority` 校验。
    #[account(address = company.authority @ PayrollError::Unauthorized)]
    pub authority: SystemAccount<'info>,

    /// CHECK: 员工钱包地址，仅写入流记录（本指令不签名、不转账）。
    pub recipient: UncheckedAccount<'info>,

    #[account(address = company.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = employer,
        associated_token::token_program = token_program,
    )]
    pub employer_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = employer,
        space = 8 + PayrollStream::INIT_SPACE,
        seeds = [STREAM_SEED, company.key().as_ref(), &stream_id.to_le_bytes()],
        bump,
    )]
    pub stream: Account<'info, PayrollStream>,

    /// 托管金库：stream PDA 持有的 ATA。
    #[account(
        init,
        payer = employer,
        associated_token::mint = mint,
        associated_token::authority = stream,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn create_stream(
    ctx: Context<CreateStream>,
    stream_id: u64,
    total_amount: u64,
    start_time: i64,
    end_time: i64,
    withholding_rate: u16,
) -> Result<()> {
    require!(end_time > start_time, PayrollError::InvalidTimeRange);
    require!(total_amount > 0, PayrollError::InvalidAmount);
    require!(
        withholding_rate <= BPS_BASE,
        PayrollError::InvalidWithholdingRate
    );

    let now = Clock::get()?.unix_timestamp;

    {
        let stream = &mut ctx.accounts.stream;
        stream.company = ctx.accounts.company.key();
        stream.employer = ctx.accounts.employer.key();
        stream.recipient = ctx.accounts.recipient.key();
        stream.mint = ctx.accounts.mint.key();
        stream.vault = ctx.accounts.vault.key();
        stream.total_amount = total_amount;
        stream.withdrawn_amount = 0;
        stream.start_time = start_time;
        stream.end_time = end_time;
        stream.withholding_rate = withholding_rate;
        stream.stream_id = stream_id;
        stream.cancelled = false;
        stream.created_at = now;
        stream.bump = ctx.bumps.stream;
    }

    // 本金注入托管金库
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.employer_ata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.employer.to_account_info(),
            },
        ),
        total_amount,
        ctx.accounts.mint.decimals,
    )?;

    let company = &mut ctx.accounts.company;
    company.total_streams = company
        .total_streams
        .checked_add(1)
        .ok_or(PayrollError::MathOverflow)?;

    emit!(StreamCreated {
        stream: ctx.accounts.stream.key(),
        company: ctx.accounts.company.key(),
        employer: ctx.accounts.employer.key(),
        recipient: ctx.accounts.recipient.key(),
        mint: ctx.accounts.mint.key(),
        total_amount,
        start_time,
        end_time,
        withholding_rate,
        stream_id,
    });

    Ok(())
}
