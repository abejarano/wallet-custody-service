import { WalletRepository } from "@/crypto/KeyManager.interface"
import { WithdrawalService } from "@/withdrawals/WithdrawalService"
import {
  WithdrawalAsset,
  WithdrawalMessage,
} from "@/withdrawals/interfaces"

export interface BrokerWithdrawalPayload {
  clientId: string
  withdrawalId: string
  asset: string
  amount: string
  toAddress: string
}

export class WithdrawalConsumer {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly withdrawalService: WithdrawalService
  ) {}

  async handleBrokerMessage(payload: BrokerWithdrawalPayload): Promise<void> {
    const asset = this.normalizeAsset(payload.asset)
    const wallet = await this.walletRepo.findByOwnerAndAsset(
      payload.clientId,
      asset
    )

    if (!wallet) {
      throw new Error(
        `No se encontró wallet para ${payload.clientId} / ${asset}`
      )
    }

    const message: WithdrawalMessage = {
      clientId: payload.clientId,
      withdrawalId: payload.withdrawalId,
      asset,
      amount: payload.amount,
      toAddress: payload.toAddress,
      wallet,
    }

    await this.withdrawalService.processWithdrawal(message)
  }

  private normalizeAsset(asset: string): WithdrawalAsset {
    const upper = asset.toUpperCase()
    const supported: WithdrawalAsset[] = [
      "BTC",
      "ETH",
      "USDT-ERC20",
      "TRX",
      "USDT-TRC20",
    ]

    if ((supported as string[]).includes(upper)) {
      return upper as WithdrawalAsset
    }

    throw new Error(`Asset ${asset} no soportado`)
  }
}
