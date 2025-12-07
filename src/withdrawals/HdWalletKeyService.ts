import { DecryptCommand } from "@aws-sdk/client-kms"
import * as bip39 from "bip39"
import BIP32Factory, { BIP32Interface } from "bip32"
import * as ecc from "tiny-secp256k1"
import * as secp from "@noble/secp256k1"

import {
  SealedSecret,
  SealedSecretRepository,
} from "@/crypto/SealedSecretRepository.interface"
import { WalletRecord } from "@/crypto/KeyManager.interface"
import { kmsClient } from "@/crypto/kmsClient"
import { aesGcmDecrypt } from "@/crypto/aes"

const bip32 = BIP32Factory(ecc as any)

export interface DerivedWalletKey {
  wallet: WalletRecord
  privateKey: Buffer
  publicKey: Buffer
  compressedPublicKey: Buffer
  derivationPath: string
}

export class HdWalletKeyService {
  constructor(private readonly sealedRepo: SealedSecretRepository) {}

  async deriveWalletKey(wallet: WalletRecord): Promise<DerivedWalletKey> {
    if (!wallet.sealedSecretId || !wallet.derivationPath) {
      throw new Error(
        `Wallet ${wallet.walletId} no tiene sealedSecretId/derivationPath`
      )
    }

    const sealed = await this.sealedRepo.findById(wallet.sealedSecretId)
    if (!sealed) {
      throw new Error(`No se encontró el sealed secret ${wallet.sealedSecretId}`)
    }

    const mnemonic = await this.unsealMnemonic(sealed)
    const seed = await bip39.mnemonicToSeed(mnemonic)
    const child = this.deriveChild(seed, wallet.derivationPath)

    if (!child.privateKey) {
      throw new Error(
        `No fue posible derivar la private key para ${wallet.derivationPath}`
      )
    }

    const privateKey = Buffer.from(child.privateKey)
    const publicKey = Buffer.from(secp.getPublicKey(privateKey, false))
    const compressedPublicKey = Buffer.from(secp.getPublicKey(privateKey, true))

    return {
      wallet,
      privateKey,
      publicKey,
      compressedPublicKey,
      derivationPath: wallet.derivationPath,
    }
  }

  private deriveChild(seed: Buffer, derivationPath: string): BIP32Interface {
    const root = bip32.fromSeed(seed)
    return root.derivePath(derivationPath)
  }

  private async unsealMnemonic(sealed: SealedSecret): Promise<string> {
    const decryptResp = await kmsClient.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(sealed.dataKeyCipherB64, "base64"),
        EncryptionContext: sealed.encContext,
      })
    )

    if (!decryptResp.Plaintext) {
      throw new Error("KMS Decrypt no devolvió plaintext")
    }

    const dataKey = Buffer.from(decryptResp.Plaintext)
    const mnemonicBuf = aesGcmDecrypt(
      dataKey,
      Buffer.from(sealed.ivB64, "base64"),
      Buffer.from(sealed.authTagB64, "base64"),
      Buffer.from(sealed.secretCipherB64, "base64")
    )

    return mnemonicBuf.toString("utf8")
  }
}
