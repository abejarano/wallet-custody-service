// src/crypto/index.ts
import * as secp from "@noble/secp256k1"
import { Chain } from "../KeyManager.interface"
import {
  btcP2PKHAddressFromUncompressedPublicKey,
  ethAddressFromUncompressedPublicKey,
  tronAddressFromUncompressedPublicKey,
} from "@/crypto/helpers/chainAddressDerivers"

// ---------- Parsing SPKI de KMS (GetPublicKey) ----------

function readAsn1Length(
  buf: Buffer,
  offset: number
): { length: number; offset: number } {
  if (offset >= buf.length) {
    throw new Error("Invalid DER: unexpected end of buffer al leer longitud")
  }

  let len = buf[offset++]
  if ((len & 0x80) === 0) {
    return { length: len, offset }
  }

  const numBytes = len & 0x7f
  if (numBytes === 0 || numBytes > 4 || offset + numBytes > buf.length) {
    throw new Error("Invalid DER: longitud codificada es inválida")
  }

  let value = 0
  for (let i = 0; i < numBytes; i++) {
    value = (value << 8) | buf[offset++]
  }

  return { length: value, offset }
}

/**
 * Extrae el punto EC sin comprimir (0x04|X|Y) desde un SPKI DER (lo que da KMS).
 * Parser minimalista que sigue la estructura SEQUENCE { algo, BIT STRING }.
 */
export function extractUncompressedPointFromKmsSpki(
  spkiDer: Uint8Array
): Buffer {
  const buf = Buffer.from(spkiDer)
  let offset = 0

  if (buf[offset++] !== 0x30) {
    throw new Error("SPKI inválido: falta encabezado de secuencia")
  }
  let info = readAsn1Length(buf, offset)
  const spkiEnd = info.offset + info.length
  offset = info.offset

  if (buf[offset++] !== 0x30) {
    throw new Error("SPKI inválido: se esperaba algoritmo (SEQUENCE)")
  }
  info = readAsn1Length(buf, offset)
  offset = info.offset + info.length

  if (buf[offset++] !== 0x03) {
    throw new Error("SPKI inválido: se esperaba BIT STRING para la public key")
  }
  info = readAsn1Length(buf, offset)
  offset = info.offset

  const unusedBits = buf[offset++]
  if (unusedBits !== 0) {
    throw new Error("SPKI inválido: BIT STRING con bits sin usar")
  }

  const key = buf.subarray(offset, offset + info.length - 1)
  if (offset + info.length - 1 > spkiEnd) {
    throw new Error("SPKI inválido: BIT STRING más largo que la secuencia")
  }
  if (key.length !== 65 || key[0] !== 0x04) {
    throw new Error("SPKI inválido: public key no es un punto uncompressed")
  }

  return Buffer.from(key)
}

export interface DerivedAddressData {
  address: string
  uncompressedPublicKey: Buffer
}

export const chainAddressDerivers: Record<Chain, (pubKey: Buffer) => string> = {
  ETH: ethAddressFromUncompressedPublicKey,
  BTC: btcP2PKHAddressFromUncompressedPublicKey,
  TRX: tronAddressFromUncompressedPublicKey,
}

/**
 * Permite derivar address + public key para cualquier chain soportada sin
 * acoplar la lógica a un caso específico. Añadir una nueva chain implica
 * registrar un nuevo deriver en `chainAddressDerivers`.
 */
export function deriveAddressDataFromSpki(
  chain: Chain,
  spkiDer: Uint8Array
): DerivedAddressData {
  const uncompressed = extractUncompressedPointFromKmsSpki(spkiDer)
  const deriver = chainAddressDerivers[chain]

  if (!deriver) {
    throw new Error(`Chain no soportada para derivar address: ${chain}`)
  }

  return {
    address: deriver(uncompressed),
    uncompressedPublicKey: uncompressed,
  }
}

// ---------- DER → (r,s) y recuperación ---------- //

/**
 * KMS devuelve firma ECDSA en DER. La parseamos a {r,s} y las normalizamos a 32 bytes.
 */
export function derSignatureToRS(der: Uint8Array): { r: Buffer; s: Buffer } {
  const buf = Buffer.from(der)

  if (buf.length < 8 || buf[0] !== 0x30) {
    throw new Error("Invalid DER signature: missing sequence header")
  }

  const totalLength = buf[1]
  if (totalLength + 2 !== buf.length) {
    throw new Error("Invalid DER signature: inconsistent length")
  }

  let offset = 2

  const readInteger = (): Buffer => {
    if (buf[offset++] !== 0x02) {
      throw new Error("Invalid DER signature: expected integer tag")
    }
    const length = buf[offset++]
    const end = offset + length
    if (length <= 0 || end > buf.length) {
      throw new Error("Invalid DER signature: integer length overflow")
    }
    const bytes = buf.subarray(offset, end)
    offset = end

    // quitar leading zeros y left-pad a 32 bytes
    let start = 0
    while (start < bytes.length && bytes[start] === 0) {
      start++
    }
    const stripped = bytes.subarray(start)
    if (stripped.length > 32) {
      throw new Error("Invalid DER signature: integer too large")
    }
    if (stripped.length === 32) {
      return stripped
    }

    const padded = Buffer.alloc(32)
    stripped.copy(padded, 32 - stripped.length)
    return padded
  }

  const r = readInteger()
  const s = readInteger()

  return { r, s }
}

export function computeRecoveryIdFromSignature(params: {
  digest: Buffer
  r: Buffer
  s: Buffer
  publicKey: Buffer
}): number {
  const { digest, r, s, publicKey } = params
  const sigBytes = new Uint8Array(Buffer.concat([r, s]))
  const msg = new Uint8Array(digest)

  for (let recovery = 0; recovery < 4; recovery++) {
    const recoveredSig = new Uint8Array(sigBytes.length + 1)
    recoveredSig[0] = recovery
    recoveredSig.set(sigBytes, 1)

    try {
      const recovered = secp.recoverPublicKey(recoveredSig, msg, {
        prehash: false,
      })
      if (recovered && Buffer.from(recovered).equals(publicKey)) {
        return recovery & 1
      }
    } catch {
      // intenta el siguiente recovery id
    }
  }

  throw new Error("No se pudo determinar el recovery id para la firma")
}

export function computeChainSignatureValues(params: {
  chain: Chain
  digest: Buffer
  r: Buffer
  s: Buffer
  publicKeyHex?: string
}): { v?: number; recovery?: number } {
  const { chain, digest, r, s, publicKeyHex } = params
  if (!publicKeyHex) return {}

  const publicKey = Buffer.from(publicKeyHex, "hex")
  const recovery = computeRecoveryIdFromSignature({
    digest,
    r,
    s,
    publicKey,
  })

  if (chain === "ETH") {
    return { recovery, v: 27 + recovery }
  }

  if (chain === "TRX") {
    return { recovery, v: recovery }
  }

  return { recovery }
}
