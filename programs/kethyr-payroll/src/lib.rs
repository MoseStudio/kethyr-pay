//! Kethyr Flow — 企业隐私级流式薪酬与生息财资系统。
//!
//! 纯时间确定性结算：本金注入 `stream` PDA 托管金库，员工按
//! `unlocked = total * (now - start) / (end - start)` 线性解锁，
//! `claim` 时在程序内做原子分流（net → 员工、tax → 企业税务金库）。

// Anchor 宏内部使用 `custom-heap` / `custom-panic` / `anchor-debug` 等 cfg，
// 在外层 crate 触发 unexpected_cfgs 噪声；这些是已知的良性告警。
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Afm1YLnn7WBqbGgBvtxt8GMdV4LbogNqkhbtErXouP4v");

#[program]
pub mod kethyr_payroll {
    use super::*;

    /// 初始化企业配置 + 税务金库。
    pub fn initialize_company(
        ctx: Context<InitializeCompany>,
        withholding_rate: u16,
        auditor: Pubkey,
    ) -> Result<()> {
        instructions::initialize_company::initialize_company(ctx, withholding_rate, auditor)
    }

    /// 更新默认税率 / 审计员。
    pub fn update_company(
        ctx: Context<UpdateCompany>,
        withholding_rate: u16,
        auditor: Pubkey,
    ) -> Result<()> {
        instructions::update_company::update_company(ctx, withholding_rate, auditor)
    }

    /// 开一条流：注入本金、写入起止时间与税率。
    pub fn create_stream(
        ctx: Context<CreateStream>,
        stream_id: u64,
        total_amount: u64,
        start_time: i64,
        end_time: i64,
        withholding_rate: u16,
    ) -> Result<()> {
        instructions::create_stream::create_stream(
            ctx,
            stream_id,
            total_amount,
            start_time,
            end_time,
            withholding_rate,
        )
    }

    /// 提取已解锁额度，原子代扣税。
    pub fn claim_stream(ctx: Context<ClaimStream>, stream_id: u64) -> Result<()> {
        instructions::claim_stream::claim_stream(ctx, stream_id)
    }

    /// 终止流：已工作部分即时归员工，剩余退回雇主。
    pub fn cancel_stream(ctx: Context<CancelStream>, stream_id: u64) -> Result<()> {
        instructions::cancel_stream::cancel_stream(ctx, stream_id)
    }

    /// 关闭已终止且清空的流账户，回收租金。
    pub fn close_stream(ctx: Context<CloseStream>, stream_id: u64) -> Result<()> {
        instructions::close_stream::close_stream(ctx, stream_id)
    }
}
