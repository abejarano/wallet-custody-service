import { ethers } from "ethers"
import { WithdrawalAsset } from "./interfaces"

const ASSET_DECIMALS: Record<WithdrawalAsset, number> = {
  BTC: 8,
  ETH: 18,
  "USDT-ERC20": 6,
  TRX: 6,
  "USDT-TRC20": 6,
}

export function amountToMinorUnits(
  asset: WithdrawalAsset,
  humanAmount: string
): bigint {
  const decimals = ASSET_DECIMALS[asset]
  return ethers.parseUnits(humanAmount, decimals)
}

export function formatMinorUnits(
  asset: WithdrawalAsset,
  amount: bigint
): string {
  const decimals = ASSET_DECIMALS[asset]
  return ethers.formatUnits(amount, decimals)
}
