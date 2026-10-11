use anchor_lang::prelude::*;

/// 企业配置：税率、税务金库、审计员的唯一权威来源。
///
/// PDA seeds: `[COMPANY_SEED, authority]`
#[account]
#[derive(InitSpace)]
pub struct CompanyConfig {
    /// 企业主 / 发薪主体，拥有 update / create_stream 权限。
    pub authority: Pubkey,
    /// 发薪代币 mint（一个企业绑定一种代币）。
    pub mint: Pubkey,
    /// 代扣税务金库（company PDA 的 ATA，authority 为 company PDA）。
    pub tax_vault: Pubkey,
    /// 只读合规审计员；`Pubkey::default()` 表示未设置。
    pub auditor: Pubkey,
    /// 默认预扣税率（基准点，10000 = 100%）。
    pub withholding_rate: u16,
    /// 累计开流数量（统计用）。
    pub total_streams: u64,
    pub created_at: i64,
    pub bump: u8,
}
