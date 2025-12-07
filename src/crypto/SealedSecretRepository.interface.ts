export interface SealedSecret {
  id: string
  ownerId: string
  encContext: Record<string, string>
  dataKeyCipherB64: string
  ivB64: string
  authTagB64: string
  secretCipherB64: string
  createdAt: Date
}

export interface SealedSecretRepository {
  save(secret: SealedSecret): Promise<SealedSecret>
  findById(id: string): Promise<SealedSecret | null>
}
