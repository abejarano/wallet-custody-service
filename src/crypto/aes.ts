import crypto from "node:crypto"

export function aesGcmEncrypt(
  key: Buffer,
  plaintext: Buffer
): { iv: Buffer; ciphertext: Buffer; authTag: Buffer } {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { iv, ciphertext, authTag }
}

export function aesGcmDecrypt(
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
  ciphertext: Buffer
): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}
