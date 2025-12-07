import { WalletRecord } from "@/crypto/KeyManager.interface"

export type WithdrawalAsset =
  | "BTC"
  | "ETH"
  | "USDT-ERC20"
  | "TRX"
  | "USDT-TRC20"

export interface WithdrawalMessage {
  clientId: string
  asset: WithdrawalAsset
  amount: string // unidades del asset (ej: "0.01")
  toAddress: string
  withdrawalId: string
  wallet: WalletRecord
}

export interface LedgerGateway {
  getAvailableBalance(clientId: string, asset: string): Promise<bigint>
  reserveFunds(params: {
    clientId: string
    asset: string
    amount: bigint
    withdrawalId: string
  }): Promise<void>
  releaseReservation(params: {
    clientId: string
    asset: string
    amount: bigint
    withdrawalId: string
    reason: string
  }): Promise<void>
  markWithdrawalCompleted(params: {
    clientId: string
    asset: string
    amount: bigint
    withdrawalId: string
    txid: string
  }): Promise<void>
}

export type WithdrawalStatus =
  | "PENDING"
  | "FAILED"
  | "PROCESSED"

export interface WithdrawalEvent {
  clientId: string
  withdrawalId: string
  asset: WithdrawalAsset
  status: WithdrawalStatus
  amount: string
  toAddress: string
  reason?: string
  balanceAvailable?: string
  txid?: string
}

export interface WithdrawalStatusPublisher {
  publish(event: WithdrawalEvent): Promise<void>
}

export interface WithdrawalContext {
  request: WithdrawalMessage
  amountInMinorUnits: bigint
}

export interface BroadcastResult {
  txid: string
  rawTransaction?: string
  fee?: string
}

export interface ChainWithdrawalAdapter {
  supports(asset: WithdrawalAsset): boolean
  execute(ctx: WithdrawalContext): Promise<BroadcastResult>
}

export interface BitcoinNodePsbtResponse {
  psbt: string
  fee: number
  changePosition: number
}

export interface BitcoinFinalizePsbtResult {
  hex: string
  complete: boolean
}

export interface BitcoinNodeClient {
  walletCreateFundedPsbt(params: {
    toAddress: string
    amountSats: bigint
    changeAddress?: string
  }): Promise<BitcoinNodePsbtResponse>
  finalizePsbt(psbtBase64: string): Promise<BitcoinFinalizePsbtResult>
  sendRawTransaction(rawTx: string): Promise<string>
}
