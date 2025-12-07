export interface HdWalletIndexRepository {
  /**
   * Reserva y devuelve el siguiente index disponible para el sealedSecretId.
   * Debe ser atómico para evitar colisiones en entornos concurrentes.
   */
  reserveNextIndex(sealedSecretId: string): Promise<number>
}
