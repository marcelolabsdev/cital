import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ---------- Servicios ----------

export interface Service {
  id: string
  name: string
  description: string | null
  durationMinutes: number
  priceClp: number
  color: string | null
  isActive: boolean
  sortOrder: number
}

export interface ServiceInput {
  name: string
  description?: string | null
  durationMinutes: number
  priceClp: number
  color?: string | null
  isActive?: boolean
}

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => (await api<{ services: Service[] }>('/api/panel/services')).services,
  })
}

export function useSaveService() {
  const qc = useQueryClient()
  return useMutation({
    // Al editar basta un parcial (ej. solo isActive); al crear se exige todo
    mutationFn: ({ id, data }: { id?: string; data: ServiceInput | Partial<ServiceInput> }) =>
      id
        ? api(`/api/panel/services/${id}`, { method: 'PATCH', body: data })
        : api('/api/panel/services', { method: 'POST', body: data as ServiceInput }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useDeleteService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/panel/services/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

// ---------- Profesionales ----------

export interface Professional {
  id: string
  name: string
  email: string | null
  phone: string | null
  bio: string | null
  color: string | null
  isActive: boolean
  serviceIds: string[]
}

export interface ProfessionalInput {
  name: string
  email?: string | null
  phone?: string | null
  bio?: string | null
  color?: string | null
  isActive?: boolean
  serviceIds?: string[]
}

export function useProfessionals() {
  return useQuery({
    queryKey: ['professionals'],
    queryFn: async () =>
      (await api<{ professionals: Professional[] }>('/api/panel/professionals')).professionals,
  })
}

export function useSaveProfessional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: ProfessionalInput | Partial<ProfessionalInput> }) =>
      id
        ? api(`/api/panel/professionals/${id}`, { method: 'PATCH', body: data })
        : api('/api/panel/professionals', { method: 'POST', body: data as ProfessionalInput }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professionals'] }),
  })
}

export function useDeleteProfessional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/panel/professionals/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professionals'] }),
  })
}

// ---------- Horarios ----------

export interface ScheduleInterval {
  id: string
  professionalId: string | null
  weekday: number
  startMinute: number
  endMinute: number
}

export function useSchedules(professionalId: string | null) {
  return useQuery({
    queryKey: ['schedules', professionalId],
    queryFn: async () => {
      const qs = professionalId ? `?professionalId=${professionalId}` : '?professionalId=business'
      const res = await api<{ intervals: ScheduleInterval[] }>(`/api/panel/schedules${qs}`)
      return res.intervals
    },
  })
}

export function useSaveSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      professionalId,
      intervals,
    }: {
      professionalId: string | null
      intervals: { weekday: number; startMinute: number; endMinute: number }[]
    }) =>
      api('/api/panel/schedules', {
        method: 'PUT',
        body: { professionalId, intervals },
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['schedules', vars.professionalId] })
    },
  })
}

// ---------- Bloqueos ----------

export interface TimeBlock {
  id: string
  professionalId: string | null
  kind: 'block' | 'holiday' | 'vacation'
  startAt: string
  endAt: string
  note: string | null
}

export function useBlocks() {
  return useQuery({
    queryKey: ['blocks'],
    queryFn: async () => (await api<{ blocks: TimeBlock[] }>('/api/panel/blocks')).blocks,
  })
}

export function useCreateBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      kind: 'block' | 'holiday' | 'vacation'
      dateFrom: string
      dateTo: string
      professionalId?: string | null
      note?: string
    }) => api('/api/panel/blocks', { method: 'POST', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }),
  })
}

export function useDeleteBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/panel/blocks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }),
  })
}

export function useSeedHolidays() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (year: number) =>
      api<{ inserted: number }>('/api/panel/blocks/holidays', { method: 'POST', body: { year } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }),
  })
}

// ---------- Citas ----------

export interface PanelAppointment {
  id: string
  serviceId: string
  professionalId: string
  customerId: string
  startAt: string // UTC ISO
  endAt: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  priceClp: number
  notes: string | null
  source: 'public' | 'panel'
  manageToken: string
  serviceName: string
  serviceDurationMinutes: number
  professionalName: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
}

export function useAppointments(from: string, to: string) {
  return useQuery({
    queryKey: ['appointments', from, to],
    queryFn: () =>
      api<{ appointments: PanelAppointment[] }>(
        `/api/panel/appointments?from=${from}&to=${to}`,
      ).then((r) => r.appointments),
  })
}

export function useCreateManualAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      serviceId: string
      professionalId: string
      date: string
      minuteOfDay: number
      customerName: string
      customerPhone?: string
      notes?: string
      status: 'pending' | 'confirmed'
    }) => api<{ appointmentId: string }>('/api/panel/appointments', { method: 'POST', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

export function useMoveAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string
      professionalId?: string
      date?: string
      minuteOfDay?: number
    }) => api<{ moved: boolean }>(`/api/panel/appointments/${id}/move`, { method: 'PATCH', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
}

export function useSetAppointmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: PanelAppointment['status']; reason?: string }) =>
      api(`/api/panel/appointments/${id}/status`, { method: 'PATCH', body: { status, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ---------- Clientes ----------

export interface PanelCustomer {
  id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  createdAt: string
  appointmentsCount: number
}

export function useCustomers(q: string) {
  return useQuery({
    queryKey: ['customers', q],
    queryFn: () =>
      api<{ customers: PanelCustomer[] }>(`/api/panel/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(
        (r) => r.customers,
      ),
  })
}

export interface CustomerDetail {
  customer: {
    id: string
    name: string
    phone: string | null
    email: string | null
    notes: string | null
    createdAt: string
  }
  history: {
    id: string
    startAt: string
    endAt: string
    status: PanelAppointment['status']
    priceClp: number
    source: string
    serviceName: string
  }[]
}

export function useCustomerDetail(id: string | null) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<CustomerDetail>(`/api/panel/customers/${id}`),
    enabled: !!id,
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; notes: string; name?: string }) =>
      api(`/api/panel/customers/${id}`, { method: 'PATCH', body: data }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['customer', vars.id] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

// ---------- Dashboard ----------

export interface DashboardData {
  today: {
    date: string
    appointments: {
      id: string
      startAt: string
      endAt: string
      status: PanelAppointment['status']
      priceClp: number
      serviceName: string
      professionalName: string
      customerName: string
      customerPhone: string | null
    }[]
  }
  month: {
    estimatedRevenueClp: number
    upcomingCount: number
    completedCount: number
    cancelledCount: number
    cancellationRate: number
    topServices: { name: string; count: number }[]
  }
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/api/panel/dashboard'),
    staleTime: 30_000,
  })
}
