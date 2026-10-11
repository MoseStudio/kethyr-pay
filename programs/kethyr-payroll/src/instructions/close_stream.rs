use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, CloseAccount, TokenAccount, TokenInterface};

use crate::{
    constants::{COMPANY_SEED, STREAM_SEED},
    error::PayrollError,
    events::StreamClosed,
    state::{CompanyConfig, PayrollStream},
};

#[derive(Accounts)]
#[instruction(stream_id: u64)]
pub struct CloseStream<'info> {
    /// 雇主回收 stream PDA 与空金库的租金。
    #[account(mut)]
    pub employer: Signer<'info>,

    #[account(
        seeds = [COMPANY_SEED, employer.key().as_ref()],
        bump = company.bump,
        has_one = authority @ PayrollError::Unauthorized,
    )]
    pub company: Account<'info, CompanyConfig>,

    #[account(address = company.authority @ PayrollError::Unauthorized)]
    pub authority: SystemAccount<'info>,

    #[account(
        mut,
        close = employer,
        seeds = [STREAM_SEED, company.key().as_ref(), &stream_id.to_le_bytes()],
        bump = stream.bump,
        constraint = stream.cancelled @ PayrollError::StreamNotCancelled,
    )]
    pub stream: Account<'info, PayrollStream>,

    #[account(
        mut,
        address = anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &stream.key(),
            &stream.mint,
            token_program.key,
        ),
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn close_stream(ctx: Context<CloseStream>, stream_id: u64) -> Result<()> {
    require!(ctx.accounts.vault.amount == 0, PayrollError::VaultNotEmpty);

    let company_key = ctx.accounts.company.key();
    let stream_id_bytes = stream_id.to_le_bytes();
    let bump = ctx.accounts.stream.bump;
    let seeds: &[&[u8]] = &[
        STREAM_SEED,
        company_key.as_ref(),
        &stream_id_bytes,
        &[bump],
    ];
    let signer_seeds = &[seeds];

    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.employer.to_account_info(),
            authority: ctx.accounts.stream.to_account_info(),
        },
        signer_seeds,
    ))?;

    emit!(StreamClosed {
        stream: ctx.accounts.stream.key(),
        employer: ctx.accounts.employer.key(),
    });

    Ok(())
}
