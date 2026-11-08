// Record ids are UUIDv7, generated on the phone (ADR-0026), so a record has its id before the
// server has ever seen it.

/**
 * A new UUIDv7 (RFC 9562 §5.7): 48 bits of Unix time in milliseconds, the version (7), 12 random
 * bits, the variant (binary 10) and 62 random bits. Ids made later sort later, to the millisecond.
 *
 * @param now   The time to encode (a parameter so tests can fix it).
 * @param fill  Fills a buffer with random bytes; the browser's cryptographic generator by default.
 */
export function newId(
  now: Date = new Date(),
  fill: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = new Uint8Array(16)
  fill(bytes)
  let ms = now.getTime()
  if (!Number.isSafeInteger(ms) || ms < 0 || ms >= 2 ** 48) {
    throw new RangeError('time outside the range of a UUIDv7')
  }
  // Bytes 0-5: the time, most significant byte first. (Bit shifts in JavaScript work on 32-bit
  // integers, so the 48-bit number is split with division instead.)
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256
    ms = Math.floor(ms / 256)
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f) // version 7 in the high four bits
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f) // variant 10 in the high two bits
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
