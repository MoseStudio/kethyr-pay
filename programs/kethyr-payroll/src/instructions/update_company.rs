use anchor_lang::prelude::*;

use crate::{
    constants::{BPS_BASE, COMPANY_SEED},
    error::PayrollError,
    events::CompanyUpdated,
    state::CompanyConfig,
};

#[derive(Accounts)]
pub struct UpdateCompany<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [COMPANY_SEED, authority.key().as_ref()],
        bump = company.bump,
        has_one = authority @ PayrollError::Unauthorized,
    )]
    pub company: Account<'info, CompanyConfig>,
}

pub fn update_company(
    ctx: Context<UpdateCompany>,
    withholding_rate: u16,
    auditor: Pubkey,
) -> Result<()> {
    require!(
        withholding_rate <= BPS_BASE,
        PayrollError::InvalidWithholdingRate
    );

    let company = &mut ctx.accounts.company;
    company.withholding_rate = withholding_rate;
    company.auditor = auditor;

    emit!(CompanyUpdated {
        company: company.key(),
        withholding_rate,
        auditor,
    });

    Ok(())
}
