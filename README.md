# wallet-on-chain

Servicio de orquestación para crear wallets, derivar nuevas direcciones de pago y procesar retiros on-chain para BTC, ETH y TRX (incluye USDT en ERC20/TRC20). El repo trae la lógica de dominio y los contratos de integración, pero **no** incluye la infraestructura (DB, colas, RPCs, ni despliegues de nodos).

## Casos de uso cubiertos
- Crear wallet nuevo con AWS KMS puro (`KmsOnlyKeyManager`) o con mnemónico sellado en KMS (`SealedMnemonicKeyManager`).
- Derivar una nueva dirección de pago a partir de un wallet basado en mnemónico (`deriveAddress` en `SealedMnemonicKeyManager`).
- Procesar retiros on-chain multi‑asset (`WithdrawalService` + adaptadores BTC/ETH/TRX) publicando el estado del retiro.

## Flujo de creación/derivación de wallets
- Consumidor: `src/consumers/WalletCommandConsumer.ts`
  - Comando `CREATE_WALLET`: `{ type, ownerId, chain, assetCode }` → llama a `keyManager.createWallet`.
  - Comando `DERIVE_ADDRESS`: `{ type, walletId, index? }` → busca el wallet base y ejecuta `deriveAddress` si el `keyManager` lo soporta (requiere `SealedMnemonicKeyManager`).
- `SealedMnemonicKeyManager`: genera mnemónico BIP-39, lo sella con KMS, deriva la dirección `m/44'/coinType'/0'/0/index`, guarda `sealedSecretId` y `derivationPath`. Puede derivar nuevas direcciones sobre el mismo mnemónico.
- `KmsOnlyKeyManager`: crea la clave ECDSA secp256k1 en KMS y deriva la dirección directamente desde la llave pública devuelta por KMS. No deriva nuevas direcciones.
- `HdWalletKeyService`: desencripta el mnemónico sellado y deriva la llave privada/pública para firmar o gastar fondos.

## Flujo de retiros on-chain
- Consumidor: `src/consumers/WithdrawalConsumer.ts`
  - Recibe `{ clientId, withdrawalId, asset, amount, toAddress }`, resuelve el wallet del cliente y delega en `WithdrawalService`.
- Servicio: `src/withdrawals/WithdrawalService.ts`
  - Calcula montos en unidades mínimas, valida balance disponible vía `LedgerGateway`, reserva fondos, ejecuta el adaptador de red y marca el retiro como completado o fallido.
- Adaptadores de red:
  - BTC: `src/withdrawals/adapters/BitcoinWithdrawalAdapter.ts` usa `BitcoinNodeClient` (PSBT: `walletCreateFundedPsbt`, `finalizePsbt`, `sendRawTransaction`).
  - ETH / ERC20: `src/withdrawals/adapters/EthereumWithdrawalAdapter.ts` usa `ethers.JsonRpcProvider` y opcional `tokenConfig` `{ address, decimals }`.
  - TRX / TRC20: `src/withdrawals/adapters/TronWithdrawalAdapter.ts` usa `TronWebClient` (`sendTrx`, `triggerSmartContract`, `sign`, `sendRawTransaction`) y `tokenConfig` `{ address, feeLimitSun }`.
- Publicación de estado: `WithdrawalStatusPublisher.publish` recibe eventos `PENDING/FAILED/PROCESSED` con `txid`, `reason` o `balanceAvailable` según corresponda.

## Piezas de infraestructura que debes implementar
- **Persistencia**
  - `WalletRepository` (`src/crypto/KeyManager.interface.ts`): guardar/buscar wallets por id y por owner+asset.
  - `SealedSecretRepository` (`src/crypto/SealedSecretRepository.interface.ts`): guardar y recuperar el mnemónico sellado y metadatos KMS.
  - `HdWalletIndexRepository` (`src/crypto/HdWalletIndexRepository.interface.ts`): asignar el siguiente índice HD de forma atómica para evitar colisiones.
- **Contabilidad y eventos**
  - `LedgerGateway` (`src/withdrawals/interfaces.ts`): balance disponible, reservar/liberar fondos y marcar retiros completados.
  - `WithdrawalStatusPublisher` (`src/withdrawals/interfaces.ts`): publicar el evento del retiro procesado o fallido.
- **Clientes de red**
  - Ethereum: instanciar `ethers.JsonRpcProvider` apuntando a tu nodo/servicio RPC.
  - Bitcoin: implementar `BitcoinNodeClient` (`walletCreateFundedPsbt`, `finalizePsbt`, `sendRawTransaction`) contra tu nodo/daemon.
  - Tron: proveer un `TronWebClient` compatible (similar a `tronweb`).
- **Brokers/colas**
  - Conecta tus mensajes entrantes a `WithdrawalConsumer.handleBrokerMessage` y `WalletCommandConsumer.handle`.
  - Define tus topics/queues y serialización; el repo no trae wiring ni dependencias de mensajería.
- **Config**
  - Cargar `tokenConfig` para USDT ERC20/TRC20, `AWS_KMS_KEY_ID`, `AWS_REGION`, RPC URLs, timeouts, etc.

## Claves y uso de AWS KMS
- Cliente KMS: `src/crypto/kmsClient.ts` (usa `AWS_REGION` o `us-east-1` por defecto).
- `KmsOnlyKeyManager` (solo KMS):
  - `CreateKey` (`KeySpec: ECC_SECG_P256K1`, `KeyUsage: SIGN_VERIFY`)
  - `GetPublicKey` (para derivar dirección y `publicKeyHex`)
  - `Sign` (`MessageType: DIGEST`, `SigningAlgorithm: ECDSA_SHA_256`)
- `SealedMnemonicKeyManager` (mnemónico sellado):
  - `GenerateDataKey` con `AWS_KMS_KEY_ID` para cifrar el mnemónico (AES-GCM local).
  - `Decrypt` para obtener la data key y desencriptar el mnemónico.
  - Derivación HD: `m/44'/coinType'/0'/0/index` (coin type en `src/crypto/Config.ts`).
  - Firmas: ECDSA secp256k1 con `@noble/secp256k1`; se calculan `v/recovery` para ETH/TRX.
- `HdWalletKeyService` desencripta el mnemónico y deriva la llave privada para firmar/broadcast.

## Ejecutar y construir
- Requisitos: Node.js 18+, credenciales AWS configuradas (para KMS).
- Instalar dependencias: `npm install`.
- Compilar: `npm run build` (salida en `dist/` con paths remapeados por `tsc-alias`).

## Notas y límites conocidos
- No hay validación de entrada ni rate limiting en los consumidores; implementa en el borde (API/cola).
- Las llamadas a nodos no manejan reintentos ni backoff; añade políticas al implementar los clientes RPC.
- `DERIVE_ADDRESS` solo funciona si el `keyManager` soporta `deriveAddress` (p.ej. `SealedMnemonicKeyManager`).
