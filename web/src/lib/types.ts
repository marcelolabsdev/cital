/** Tipos compartidos con la API (camelCase, según serializa el backend). */

export interface Tenant {
  id: string
  slug: string
  name: string
  description: string | null
  timezone: string
  logoUrl: string | null
  brandColor: string
  cancellationPolicyHours: number
  cancellationPolicyMode: 'hours' | 'no_refund'
  bufferMinutes: number
  bookingLeadHours: number
  bookingWindowDays: number
  onboardingStep: number
  plan: string
  trialEndsAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PanelUser {
  id: string
  name: string
  email: string
}

export interface MeResponse {
  user: PanelUser
  tenant: Tenant
}
