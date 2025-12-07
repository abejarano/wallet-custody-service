import {
  Chain,
  KeyManagerInterface,
  WalletRecord,
  WalletRepository,
} from "@/crypto/KeyManager.interface"
import {
  DeriveAddressInput,
} from "@/crypto/SealedMnemonicKeyManager"

type WalletCommand =
  | {
      type: "CREATE_WALLET"
      ownerId: string
      chain: Chain
      assetCode: string
    }
  | {
      type: "DERIVE_ADDRESS"
      walletId: string
      /**
       * Opcional, si no se envía se usa el siguiente índice disponible.
       */
      index?: number
    }

type DerivableKeyManager = KeyManagerInterface & {
  deriveAddress?: (
    input: DeriveAddressInput
  ) => Promise<WalletRecord>
}

export class WalletCommandConsumer {
  constructor(
    private readonly keyManager: KeyManagerInterface,
    private readonly walletRepo: WalletRepository
  ) {}

  async handle(command: WalletCommand): Promise<WalletRecord> {
    switch (command.type) {
      case "CREATE_WALLET":
        return this.keyManager.createWallet({
          ownerId: command.ownerId,
          chain: command.chain,
          assetCode: command.assetCode,
        })

      case "DERIVE_ADDRESS": {
        const baseWallet = await this.walletRepo.findById(command.walletId)
        if (!baseWallet) {
          throw new Error(
            `No se encontró wallet base ${command.walletId} para derivar`
          )
        }

        const derivable = this.keyManager as DerivableKeyManager
        if (typeof derivable.deriveAddress !== "function") {
          throw new Error(
            "KeyManager configurado no soporta deriveAddress (usa SealedMnemonicKeyManager)"
          )
        }

        return derivable.deriveAddress({
          wallet: baseWallet,
          index: command.index,
        })
      }

      default: {
        const exhaustive: never = command
        throw new Error(
          `Tipo de comando no soportado: ${(exhaustive as any).type}`
        )
      }
    }
  }
}
