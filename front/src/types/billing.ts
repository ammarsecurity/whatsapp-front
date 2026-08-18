export type BillingCycle = 'monthly' | 'yearly'
export type PaymentGatewayId = 'wayl' | 'fynexpay'

export interface BillingPlan {
  id: number
  name: string
  billingCycle: BillingCycle
  priceIqd: number
  description: string
  isActive: boolean
  sortOrder: number
}

export interface PaymentMethod {
  id: PaymentGatewayId
  name: string
  minIqd: number
}

export interface AccountLicense {
  id: number
  userId: number
  planId: number | null
  billingOrderId: number | null
  accountId: string | null
  status: 'active' | 'expired' | 'cancelled'
  startsAt: string
  expiresAt: string
  planName?: string | null
  billingCycle?: string | null
}

export interface BillingEligibility {
  canAddAccount: boolean
  needsPayment: boolean
  unusedLicense: AccountLicense | null
  adminBypass: boolean
}

export interface CheckoutResult {
  success: boolean
  paymentUrl: string
  referenceId: string
  orderId: number
  amountIqd: number
}

export interface GatewayEnvSecrets {
  hasApiKey: boolean
  hasMerchantToken: boolean
  hasWebhookSecret: boolean
  apiKey?: string
  merchantToken?: string
  webhookSecret?: string
}

export interface GatewaySettings {
  isEnabled: boolean
  baseUrl: string
  environment: string
  hasApiKey: boolean
  hasMerchantToken: boolean
  hasWebhookSecret: boolean
  apiKey?: string
  merchantToken?: string
  webhookSecret?: string
  test: GatewayEnvSecrets
  live: GatewayEnvSecrets
  redirectUrl: string
  webhookUrl: string
  suggestedWebhookUrl: string
  suggestedRedirectUrl: string
  readyForCheckout: boolean
  updatedAt?: string
}

export interface PaymentTransactionRow {
  id: number
  billingOrderId: number
  gateway: string
  referenceId: string
  externalId?: string | null
  amountIqd?: number | null
  status?: string | null
  createdAt?: string
  userId?: number
  username?: string | null
  planName?: string | null
  paymentStatus?: string | null
}
