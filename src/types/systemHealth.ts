export interface SystemHealthCheck {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export interface SystemHealthResponse {
  success?: boolean
  apiBuild?: string
  timestamp?: string
  overall?: { ok: boolean; status: string }
  checks?: SystemHealthCheck[]
  system?: Record<string, unknown>
  memory?: {
    nodeProcessMb?: Record<string, number>
    systemMb?: {
      total: number
      used: number
      free: number
      usedPercent: number
    }
    chromeMb?: number | null
    chromeProcessCount?: number | null
    estimatedTotalMb?: number
  }
  chrome?: Record<string, unknown>
  whatsapp?: Record<string, unknown>
  env?: Record<string, unknown>
}
