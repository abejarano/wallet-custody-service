export type Chain = "BTC" | "ETH" | "TRX"

export interface CreateWalletInput {
  ownerId: string // ej: clientId:assetCode
  chain: Chain
  assetCode: string // "BTC", "ETH", "USDT-TRX", etc.
}

export interface WalletRecord {
  walletId: string
  ownerId: string
  chain: Chain
  assetCode: string
  address: string
  /**
   * Clave pública sin comprimir en hex (opcional, útil para recuperar v/recovery).
   */
  publicKeyHex?: string

  // KMS-only
  kmsKeyId?: string

  // Sealed mnemonic
  sealedSecretId?: string
  derivationPath?: string
}

export interface SignDigestInput {
  wallet: WalletRecord
  digest: Buffer // hash ya calculado (sighash, RLP hash, etc.)
}

export interface SignatureResult {
  r: Buffer
  s: Buffer
  // Opcional para ETH
  v?: number
  // Paridad de recuperación (0 o 1) para ECDSA
  recovery?: number
  // hex completo si quieres
  compactHex?: string
}

export interface KeyManagerInterface {
  createWallet(input: CreateWalletInput): Promise<WalletRecord>
  signDigest(input: SignDigestInput): Promise<SignatureResult>
}

export interface WalletRepository {
  save(wallet: WalletRecord): Promise<WalletRecord>

  findById(walletId: string): Promise<WalletRecord | null>

  findByOwnerAndAsset(
    ownerId: string,
    assetCode: string
  ): Promise<WalletRecord | null>
}
