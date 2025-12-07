import { ethers } from "ethers"

import {
  BroadcastResult,
  ChainWithdrawalAdapter,
  WithdrawalAsset,
  WithdrawalContext,
} from "@/withdrawals/interfaces"
import { HdWalletKeyService } from "@/withdrawals/HdWalletKeyService"

const ERC20_ABI = ["function transfer(address to, uint256 value) returns (bool)"]

export interface EthereumTokenConfig {
  address: string
  decimals: number
}

export class EthereumWithdrawalAdapter implements ChainWithdrawalAdapter {
  private readonly supportedAssets: WithdrawalAsset[] = ["ETH", "USDT-ERC20"]

  constructor(
    private readonly provider: ethers.JsonRpcProvider,
    private readonly keyService: HdWalletKeyService,
    private readonly tokenConfig: Record<string, EthereumTokenConfig> = {}
  ) {}

  supports(asset: WithdrawalAsset): boolean {
    return this.supportedAssets.includes(asset)
  }

  async execute(ctx: WithdrawalContext): Promise<BroadcastResult> {
    const { request, amountInMinorUnits } = ctx
    const { asset, toAddress, wallet } = request
    const derived = await this.keyService.deriveWalletKey(wallet)
    const privateKeyHex = "0x" + derived.privateKey.toString("hex")
    const walletSigner = new ethers.Wallet(privateKeyHex, this.provider)

    if (asset === "ETH") {
      const txResponse = await walletSigner.sendTransaction({
        to: toAddress,
        value: amountInMinorUnits,
      })
      return { txid: txResponse.hash }
    }

    const token = this.tokenConfig[asset]
    if (!token) {
      throw new Error(`No hay configuración para el token ${asset}`)
    }

    const contract = new ethers.Contract(
      token.address,
      ERC20_ABI,
      walletSigner
    )
    const txResponse = await contract.transfer(toAddress, amountInMinorUnits)
    return { txid: txResponse.hash }
  }
}
