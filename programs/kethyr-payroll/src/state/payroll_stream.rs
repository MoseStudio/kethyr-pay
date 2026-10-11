use anchor_lang::prelude::*;

use crate::constants::BPS_BASE;

/// 流式薪酬的核心状态账户。
///
/// PDA seeds: `[STREAM_SEED, company, stream_id]`
///
/// 资金托管在一枚由本 PDA 持有的 ATA 中
/// （`ATA(stream, mint, token_program)`），程序以 seeds 签名动用。
#[account]
#[derive(InitSpace)]
pub struct PayrollStream {
    /// 所属企业配置 PDA。
    pub company: Pubkey,
    /// 雇主（== company.authority），取消时剩余额度退回此处。
    pub employer: Pubkey,
    /// 员工钱包，net 收入归属。
    pub recipient: Pubkey,
    pub mint: Pubkey,
    /// 托管金库 ATA。
    pub vault: Pubkey,
    /// 流总额。
    pub total_amount: u64,
    /// 已提取总额（含代扣税部分）。
    pub withdrawn_amount: u64,
    /// 开始时间（unix 秒）。
    pub start_time: i64,
    /// 结束时间（unix 秒）。
    pub end_time: i64,
    /// 创建时快照的预扣税率（基准点）。
    pub withholding_rate: u16,
    /// 企业内唯一流编号，参与 PDA 推导。
    pub stream_id: u64,
    pub cancelled: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl PayrollStream {
    /// 线性解锁：`unlocked = total * (now - start) / (end - start)`，并封顶/下限。
    ///
    /// 用 `u128` 中间量杜绝 `u64` 溢出（release 下 `overflow-checks = true` 会 panic）。
    pub fn compute_unlocked(&self, now: i64) -> Result<u64> {
        if now <= self.start_time {
            return Ok(0);
        }
        if now >= self.end_time {
            return Ok(self.total_amount);
        }
        let elapsed = (now - self.start_time) as u128;
        let duration = (self.end_time - self.start_time) as u128;
        let total = self.total_amount as u128;
        Ok((total * elapsed / duration) as u64)
    }

    /// 可提现额度：`claimable = unlocked - withdrawn`。
    pub fn compute_claimable(&self, now: i64) -> Result<u64> {
        Ok(self.compute_unlocked(now)?.saturating_sub(self.withdrawn_amount))
    }

    /// 代扣分流：返回 `(net_payout, tax_withheld)`。
    ///
    /// `tax = amount * rate / 10000`；`net = amount - tax`（避免取整导致双加）。
    pub fn split_withholding(amount: u64, rate: u16) -> Result<(u64, u64)> {
        let tax = ((amount as u128 * rate as u128) / BPS_BASE as u128) as u64;
        Ok((amount.saturating_sub(tax), tax))
    }
}
