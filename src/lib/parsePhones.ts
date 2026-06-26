/** Normalize to digits-only international number */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

/** Parse phones from pasted text (lines, commas, tabs, semicolons) */
export function parsePhonesFromText(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of text.split(/[\n\r,;|]+/)) {
    for (const cell of part.split(/\t/)) {
      const n = normalizePhone(cell.trim())
      if (n && !seen.has(n)) {
        seen.add(n)
        out.push(n)
      }
    }
  }
  return out
}

/** Parse CSV text (first column or any cell with digits) */
export function parsePhonesFromCsv(text: string): string[] {
  return parsePhonesFromText(text)
}

/** Parse Excel workbook buffer — scans all sheets and cells */
export async function parsePhonesFromExcel(file: File): Promise<string[]> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const seen = new Set<string>()
  const out: string[] = []

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
    }) as unknown[][]

    for (const row of rows) {
      if (!Array.isArray(row)) continue
      for (const cell of row) {
        if (cell == null || cell === '') continue
        const n = normalizePhone(String(cell))
        if (n && !seen.has(n)) {
          seen.add(n)
          out.push(n)
        }
      }
    }
  }

  return out
}

export async function parsePhonesFromFile(file: File): Promise<string[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parsePhonesFromExcel(file)
  }
  const text = await file.text()
  return parsePhonesFromCsv(text)
}

export function formatPhoneCount(n: number): string {
  return `${n} number${n === 1 ? '' : 's'}`
}
