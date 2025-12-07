import { Chain } from "@/crypto/KeyManager.interface"

export const COIN_TYPE: Record<Chain, number> = {
  BTC: 0,
  ETH: 60,
  TRX: 195,
}

export const AWS_KMS_KEY_ID = process.env.AWS_KMS_KEY_ID || ""
