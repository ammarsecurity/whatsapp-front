import QRCode from 'qrcode'

/** Extract pairing / QR payload string from API response */
export function extractQrPayload(data: Record<string, unknown>): string | null {
  const keys = ['qr', 'qrcode', 'qrCode', 'code', 'pairingCode']
  for (const key of keys) {
    const val = data[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return null
}

/** True if value is already a displayable image URL or data URL */
function isImageSource(value: string): boolean {
  return (
    value.startsWith('data:image/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:')
  )
}

/** True if value looks like raw base64 PNG/JPEG (not a WhatsApp pairing token) */
function isRawBase64Image(value: string): boolean {
  if (value.includes('@') || value.includes(' ')) return false
  if (!/^[A-Za-z0-9+/=]+$/.test(value)) return false
  return value.length > 100 && (value.startsWith('iVBOR') || value.startsWith('/9j/'))
}

/**
 * Turn API QR response into an <img> src.
 * WhatsApp returns a pairing string (e.g. "2@...") — encode it as a scannable QR image.
 */
export async function qrResponseToImageSrc(
  data: Record<string, unknown>,
): Promise<string | null> {
  const payload = extractQrPayload(data)
  if (!payload) return null

  if (isImageSource(payload)) return payload
  if (isRawBase64Image(payload)) {
    return `data:image/png;base64,${payload}`
  }

  return QRCode.toDataURL(payload, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
}
