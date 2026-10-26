import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ENTITY_COLORS as COLORS, DEFAULT_ENTITY_COLOR } from '@/lib/brand'
import {
  useSaveProfessional,
  useServices,
  type Professional,
} from '@/features/panel/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'


const proSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa el nombre'),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d\s()-]{6,20}$/, 'Teléfono inválido')
    .optional()
    .or(z.literal('')),
  email: z.string().trim().email('Email inválido').optional().or(z.literal('')),
  bio: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
})

type ProForm = z.infer<typeof proSchema>

export function ProfessionalDialog({
  open,
  onOpenChange,
  professional,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  professional: Professional | null
}) {
  const { data: services } = useServices()
  const save = useSaveProfessional()
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [color, setColor] = useState(COLORS[0]!)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProForm>({ resolver: zodResolver(proSchema) })

  useEffect(() => {
    if (open) {
      reset({
        name: professional?.name ?? '',
        phone: professional?.phone ?? '',
        email: professional?.email ?? '',
        bio: professional?.bio ?? '',
      })
      setServiceIds(professional?.serviceIds ?? [])
      setColor(professional?.color ?? COLORS[0]!)
    }
  }, [open, professional, reset])

  const busyServices = services ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{professional ? 'Editar integrante' : 'Agregar integrante'}</DialogTitle>
          <DialogDescription>
            Sus datos, color y los servicios que atiende.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(async (d) => {
            try {
              await save.mutateAsync({
                id: professional?.id,
                data: {
                  name: d.name,
                  phone: d.phone || null,
                  email: d.email || null,
                  bio: d.bio || null,
                  color,
                  serviceIds,
                },
              })
              toast.success(professional ? 'Integrante actualizado' : 'Integrante agregado')
              onOpenChange(false)
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
            }
          })}
          className="grid gap-4"
          noValidate
        >
          <div className="grid gap-2">
            <Label htmlFor="pro-name">Nombre</Label>
            <Input
              id="pro-name"
              placeholder="Ej: Pedro Soto"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-[13px] text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pro-phone">
                Teléfono <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="pro-phone"
                placeholder="+56 9 1234 5678"
                inputMode="tel"
                aria-invalid={!!errors.phone}
                {...register('phone')}
              />
              {errors.phone && <p className="text-[13px] text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pro-email">
                Email <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="pro-email"
                type="email"
                placeholder="correo@ejemplo.cl"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && <p className="text-[13px] text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pro-bio">
              Presentación <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea id="pro-bio" rows={2} placeholder="Ej: 8 años de experiencia" {...register('bio')} />
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Servicios que atiende</legend>
            {busyServices.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Primero crea servicios en la sección Servicios.
              </p>
            ) : (
              <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-lg border border-border/70 p-2">
                {busyServices.map((s) => {
                  const checked = serviceIds.includes(s.id)
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors',
                        'hover:bg-accent',
                        checked && 'bg-accent/60',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() =>
                          setServiceIds((prev) =>
                            checked ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                          )
                        }
                      />
                      <span
                        className={cn(
                          'flex size-4.5 items-center justify-center rounded border transition-colors',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                        )}
                        aria-hidden="true"
                      >
                        {checked && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="flex-1">{s.name}</span>
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: s.color ?? DEFAULT_ENTITY_COLOR }}
                        aria-hidden="true"
                      />
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Color</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color del integrante">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    'size-8 rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    color === c && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </fieldset>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {professional ? 'Guardar cambios' : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
