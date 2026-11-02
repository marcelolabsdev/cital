import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useCreateManualAppointment, useProfessionals, useServices } from '@/features/panel/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Creación manual de cita desde el calendario (estado confirmado por defecto). */
export function NewAppointmentDialog({
  open,
  onOpenChange,
  presetSlot,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  presetSlot: { date: string; minute: number } | null
}) {
  const { data: services } = useServices()
  const { data: team } = useProfessionals()
  const create = useCreateManualAppointment()

  const [serviceId, setServiceId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<{ name?: string }>({})

  const activeServices = (services ?? []).filter((s) => s.isActive)
  const activeTeam = (team ?? []).filter((p) => p.isActive)
  // Solo profesionales que ofrecen el servicio elegido; si ninguno lo ofrece
  // se cae al listado completo (el backend rechazará con un mensaje claro).
  const eligibleTeam = activeTeam.filter((p) => serviceId && p.serviceIds.includes(serviceId))
  const teamOptions = eligibleTeam.length > 0 ? eligibleTeam : activeTeam

  useEffect(() => {
    if (open) {
      const firstService = activeServices[0]?.id ?? ''
      setServiceId(firstService)
      // Primer profesional que ofrezca el servicio por defecto
      const firstEligible =
        activeTeam.find((p) => firstService && p.serviceIds.includes(firstService)) ??
        activeTeam[0]
      setProfessionalId(firstEligible?.id ?? '')
      setDate(presetSlot?.date ?? new Date().toISOString().slice(0, 10))
      setTime(
        presetSlot
          ? `${String(Math.floor(presetSlot.minute / 60)).padStart(2, '0')}:${String(presetSlot.minute % 60).padStart(2, '0')}`
          : '10:00',
      )
      setCustomerName('')
      setCustomerPhone('')
      setNotes('')
      setErrors({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetSlot])

  /** Al cambiar de servicio, si el profesional actual no lo ofrece, elige uno que sí. */
  function onServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId)
    const current = activeTeam.find((p) => p.id === professionalId)
    if (!current || !current.serviceIds.includes(nextServiceId)) {
      const next =
        activeTeam.find((p) => nextServiceId && p.serviceIds.includes(nextServiceId)) ??
        activeTeam[0]
      setProfessionalId(next?.id ?? '')
    }
  }

  async function submit() {
    if (customerName.trim().length < 2) {
      setErrors({ name: 'Ingresa el nombre del cliente' })
      return
    }
    const [h, m] = time.split(':').map(Number)
    try {
      await create.mutateAsync({
        serviceId,
        professionalId,
        date,
        minuteOfDay: (h ?? 0) * 60 + (m ?? 0),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        status: 'confirmed',
      })
      toast.success('Cita creada')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la cita')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
          <DialogDescription>Crea una reserva manual para quien llame o llegue presencial.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="na-date">Fecha</Label>
              <Input id="na-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="na-time">Hora</Label>
              <Input id="na-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="na-service">Servicio</Label>
            <NativeSelect id="na-service" value={serviceId} onChange={(e) => onServiceChange(e.target.value)}>
              {activeServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMinutes} min)
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="na-pro">Profesional</Label>
            <NativeSelect id="na-pro" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
              {teamOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="na-name">Cliente</Label>
              <Input
                id="na-name"
                placeholder="Nombre y apellido"
                value={customerName}
                aria-invalid={!!errors.name}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              {errors.name && <p className="text-[13px] text-destructive">{errors.name}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="na-phone">Teléfono</Label>
              <Input
                id="na-phone"
                type="tel"
                placeholder="+56 9 …"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="na-notes">Notas</Label>
            <Textarea
              id="na-notes"
              rows={2}
              placeholder="Ej: cliente nuevo, prefiere tarde"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={create.isPending || activeServices.length === 0 || activeTeam.length === 0}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Crear cita
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
