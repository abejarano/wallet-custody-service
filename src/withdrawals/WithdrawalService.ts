import { formatMinorUnits, amountToMinorUnits } from "@/withdrawals/amounts"
import {
  BroadcastResult,
  ChainWithdrawalAdapter,
  LedgerGateway,
  WithdrawalEvent,
  WithdrawalMessage,
  WithdrawalStatusPublisher,
} from "@/withdrawals/interfaces"

type Logger = Pick<Console, "info" | "error" | "warn">

export class WithdrawalService {
  constructor(
    private readonly ledger: LedgerGateway,
    private readonly publisher: WithdrawalStatusPublisher,
    private readonly adapters: ChainWithdrawalAdapter[],
    private readonly logger: Logger = console
  ) {}

  async processWithdrawal(request: WithdrawalMessage): Promise<void> {
    const adapter = this.adapters.find((a) => a.supports(request.asset))
    if (!adapter) {
      await this.publishFailure(request, "UNSUPPORTED_ASSET")
      return
    }

    const amountInMinorUnits = amountToMinorUnits(
      request.asset,
      request.amount
    )

    const available = await this.ledger.getAvailableBalance(
      request.clientId,
      request.asset
    )

    if (amountInMinorUnits > available) {
      await this.publishFailure(request, "INSUFFICIENT_BALANCE", available)
      return
    }

    await this.ledger.reserveFunds({
      clientId: request.clientId,
      asset: request.asset,
      amount: amountInMinorUnits,
      withdrawalId: request.withdrawalId,
    })

    try {
      const broadcast = await adapter.execute({
        request,
        amountInMinorUnits,
      })

      await this.ledger.markWithdrawalCompleted({
        clientId: request.clientId,
        asset: request.asset,
        amount: amountInMinorUnits,
        withdrawalId: request.withdrawalId,
        txid: broadcast.txid,
      })

      await this.publishSuccess(request, broadcast)
    } catch (err) {
      this.logger.error(
        `[withdrawal] Error procesando ${request.withdrawalId}: ${
          (err as Error).message
        }`
      )

      await this.ledger.releaseReservation({
        clientId: request.clientId,
        asset: request.asset,
        amount: amountInMinorUnits,
        withdrawalId: request.withdrawalId,
        reason: (err as Error).message,
      })

      await this.publishFailure(
        request,
        "BROADCAST_ERROR",
        available,
        (err as Error).message
      )
    }
  }

  private async publishSuccess(
    request: WithdrawalMessage,
    result: BroadcastResult
  ) {
    const event: WithdrawalEvent = {
      clientId: request.clientId,
      withdrawalId: request.withdrawalId,
      asset: request.asset,
      status: "PROCESSED",
      amount: request.amount,
      toAddress: request.toAddress,
      txid: result.txid,
    }

    await this.publisher.publish(event)
  }

  private async publishFailure(
    request: WithdrawalMessage,
    reason: string,
    availableBalance?: bigint,
    detail?: string
  ) {
    const event: WithdrawalEvent = {
      clientId: request.clientId,
      withdrawalId: request.withdrawalId,
      asset: request.asset,
      status: "FAILED",
      amount: request.amount,
      toAddress: request.toAddress,
      reason: detail ? `${reason}:${detail}` : reason,
      balanceAvailable: availableBalance
        ? formatMinorUnits(request.asset, availableBalance)
        : undefined,
    }

    await this.publisher.publish(event)
  }
}
