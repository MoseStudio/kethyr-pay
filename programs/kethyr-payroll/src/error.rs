use anchor_lang::prelude::*;

/// Kethyr Flow 程序错误。
#[error_code]
pub enum PayrollError {
    #[msg("end_time 必须大于 start_time")]
    InvalidTimeRange,
    #[msg("withholding_rate 必须 <= 10000 (100%)")]
    InvalidWithholdingRate,
    #[msg("total_amount 必须大于 0")]
    InvalidAmount,
    #[msg("当前没有可提取的额度")]
    NothingToClaim,
    #[msg("流已被终止")]
    StreamCancelled,
    #[msg("只有在流被终止后才能关闭账户")]
    StreamNotCancelled,
    #[msg("未授权：调用者既不是雇主也不是员工")]
    Unauthorized,
    #[msg("算术溢出")]
    MathOverflow,
    #[msg("托管金库仍有余额，无法关闭")]
    VaultNotEmpty,
}
