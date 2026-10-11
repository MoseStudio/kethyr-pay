use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{BPS_BASE, COMPANY_SEED},
    error::PayrollError,
    events::CompanyInitialized,
    state::CompanyConfig,
};

#[derive(Accounts)]
pub struct InitializeCompany<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + CompanyConfig::INIT_SPACE,
        seeds = [COMPANY_SEED, authority.key().as_ref()],
        bump,
    )]
    pub company: Account<'info, CompanyConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// 税务金库：company PDA 持有的 ATA，authority 为 company PDA。
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = company,
        associated_token::token_program = token_program,
    )]
    pub tax_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_company(
    ctx: Context<InitializeCompany>,
    withholding_rate: u16,
    auditor: Pubkey,
) -> Result<()> {
    require!(
        withholding_rate <= BPS_BASE,
        PayrollError::InvalidWithholdingRate
    );

    let company = &mut ctx.accounts.company;
    company.authority = ctx.accounts.authority.key();
    company.mint = ctx.accounts.mint.key();
    company.tax_vault = ctx.accounts.tax_vault.key();
    company.auditor = auditor;
    company.withholding_rate = withholding_rate;
    company.total_streams = 0;
    company.created_at = Clock::get()?.unix_timestamp;
    company.bump = ctx.bumps.company;

    emit!(CompanyInitialized {
        company: company.key(),
        authority: company.authority,
        tax_vault: company.tax_vault,
        withholding_rate: company.withholding_rate,
    });

    Ok(())
}
