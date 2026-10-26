import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface PublicInfo {
  tenant: {
    name: string
    description: string | null
    logoUrl: string | null
    brandColor: string
    timezone: string
    cancellationPolicyHours: number
    cancellationPolicyMode: 'hours' | 'no_refund'
  }
  services: {
    id: string
    name: string
    description: string | null
    durationMinutes: number
    priceClp: number
    color: string | null
  }[]
  professionals: {
    id: string
    name: string
    color: string | null
    bio: string | null
    serviceIds: string[]
  }[]
  turnstileSiteKey: string | null
}

export interface PublicSlot {
  startIso: string
  endIso: string
  localMinute: number
  professionalId: string
}

export function usePublicInfo(slug: string) {
  return useQuery({
    queryKey: ['public', slug],
    queryFn: () => api<PublicInfo>(`/api/public/${slug}`),
    retry: 1,
    staleTime: 60_000,
  })
}

export function useAvailableDays(slug: string, serviceId: string | null, month: string, professionalId?: string | null) {
  return useQuery({
    queryKey: ['public-days', slug, serviceId, month, professionalId ?? null],
    queryFn: () =>
      api<{ month: string; days: string[] }>(
        `/api/public/${slug}/days?serviceId=${serviceId}&month=${month}` +
          (professionalId ? `&professionalId=${professionalId}` : ''),
      ),
    enabled: !!serviceId,
    staleTime: 30_000,
  })
}

export function useSlots(
  slug: string,
  serviceId: string | null,
  date: string,
  professionalId?: string | null,
) {
  return useQuery({
    queryKey: ['public-slots', slug, serviceId, date, professionalId ?? null],
    queryFn: () =>
      api<{ date: string; slots: PublicSlot[] }>(
        `/api/public/${slug}/availability?serviceId=${serviceId}&date=${date}` +
          (professionalId ? `&professionalId=${professionalId}` : ''),
      ),
    enabled: !!serviceId && !!date,
    staleTime: 10_000,
  })
}

export interface BookingResultDto {
  appointment: {
    id: string
    startAt: string
    endAt: string
    status: string
    priceClp: number
    manageToken: string
  }
}

export function useCreateBooking(slug: string) {
  return useMutation({
    mutationFn: (data: {
      serviceId: string
      professionalId: string
      startIso: string
      customer: { name: string; phone: string; email?: string }
      turnstileToken?: string
    }) => api<BookingResultDto>(`/api/public/${slug}/bookings`, { method: 'POST', body: data }),
  })
}

export interface ManagedBooking {
  appointment: {
    id: string
    tenantId: string
    tenantSlug: string
    serviceId: string
    startAt: string
    endAt: string
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
    priceClp: number
    serviceName: string
    serviceDurationMinutes: number
    professionalName: string
    customerName: string
    customerPhone: string | null
    cancelReason: string | null
    manageToken: string
  }
}

export function useManagedBooking(token: string) {
  return useQuery({
    queryKey: ['managed-booking', token],
    queryFn: () => api<ManagedBooking>(`/api/public/booking/${token}`),
    retry: 1,
  })
}

export function useCancelBooking(token: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason?: string) =>
      api<{ ok: boolean }>(`/api/public/booking/${token}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['managed-booking', token] }),
  })
}

export function useRescheduleBooking(token: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { professionalId: string; startIso: string }) =>
      api(`/api/public/booking/${token}/reschedule`, { method: 'POST', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['managed-booking', token] }),
  })
}
