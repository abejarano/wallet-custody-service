import * as bitcoin from "bitcoinjs-lib"
import * as ecc from "tiny-secp256k1"
import * as secp from "@noble/secp256k1"

import {
  BroadcastResult,
  ChainWithdrawalAdapter,
  WithdrawalAsset,
  WithdrawalContext,
  BitcoinNodeClient,
} from "@/withdrawals/interfaces"
import { HdWalletKeyService } from "@/withdrawals/HdWalletKeyService"

bitcoin.initEccLib(ecc as any)

export class BitcoinWithdrawalAdapter implements ChainWithdrawalAdapter {
  private readonly supportedAssets: WithdrawalAsset[] = ["BTC"]

  constructor(
    private readonly node: BitcoinNodeClient,
    private readonly keyService: HdWalletKeyService,
    private readonly network: bitcoin.networks.Network = bitcoin.networks.bitcoin
  ) {}

  supports(asset: WithdrawalAsset): boolean {
    return this.supportedAssets.includes(asset)
  }

  async execute(ctx: WithdrawalContext): Promise<BroadcastResult> {
    const { request, amountInMinorUnits } = ctx
    const { wallet, toAddress } = request

    const psbtResp = await this.node.walletCreateFundedPsbt({
      toAddress,
      amountSats: amountInMinorUnits,
      changeAddress: wallet.address,
    })

    const derived = await this.keyService.deriveWalletKey(wallet)
    const psbt = bitcoin.Psbt.fromBase64(psbtResp.psbt, {
      network: this.network,
    })

    const signer: bitcoin.Signer = {
      publicKey: derived.compressedPublicKey,
      sign: (hash: Buffer): Buffer => {
        const compactSig = secp.sign(new Uint8Array(hash), derived.privateKey)
        const derSignature = secp.Signature.fromBytes(
          compactSig,
          "compact"
        ).toBytes("der")
        return Buffer.from(derSignature)
      },
    }

    psbt.signAllInputs(signer)
    psbt.validateSignaturesOfAllInputs((pubkey, msghash, signature) => {
      return secp.verify(
        new Uint8Array(signature),
        new Uint8Array(msghash),
        new Uint8Array(pubkey)
      )
    })
    psbt.finalizeAllInputs()

    const finalized = await this.node.finalizePsbt(psbt.toBase64())
    if (!finalized.complete) {
      throw new Error("Bitcoin PSBT no pudo finalizarse en el nodo")
    }

    const txid = await this.node.sendRawTransaction(finalized.hex)

    return {
      txid,
      rawTransaction: finalized.hex,
      fee: psbtResp.fee.toString(),
    }
  }
}
