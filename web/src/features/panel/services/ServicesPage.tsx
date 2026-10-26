import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Plus, Pencil, Trash2, Clock3, Sparkles } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { formatClp, formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DEFAULT_ENTITY_COLOR, ENTITY_COLORS as COLORS } from '@/lib/brand'
import {
  useDeleteService,
  useSaveService,
  useServices,
  type Service,
} from '@/features/panel/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/confirm-dialog'


const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa un nombre'),
  description: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
  durationMinutes: z.coerce
    .number({ invalid_type_error: 'Ingresa la duración' })
    .int('La duración debe ser un número entero')
    .min(5, 'Mínimo 5 minutos')
    .max(480, 'Máximo 480 minutos'),
  priceClp: z.coerce
    .number({ invalid_type_error: 'Ingresa el precio' })
    .int('El precio debe ser entero')
    .min(0, 'El precio no puede ser negativo'),
})

type ServiceForm = z.infer<typeof serviceSchema>

export function ServicesPage() {
  const { data: services, isLoading } = useServices()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [deleting, setDeleting] = useState<Service | null>(null)

  const save = useSaveService()
  const remove = useDeleteService()

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Lo que tus clientes pueden reservar contigo.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
          className="shrink-0"
        >
          <Plus className="size-4" />
          Nuevo servicio
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : !services || services.length === 0 ? (
        <EmptyState onNew={() => setDialogOpen(true)} />
      ) : (
        <ul className="mt-8 space-y-3">
          {services.map((s, i) => (
            <li
              key={s.id}
            >
              <div
                className={cn(
                  'group flex items-center gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-border',
                  !s.isActive && 'opacity-60',
                )}
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${s.color ?? DEFAULT_ENTITY_COLOR}1a`, color: s.color ?? DEFAULT_ENTITY_COLOR }}
                  aria-hidden="true"
                >
                  <Sparkles className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{s.name}</p>
                    {!s.isActive && <Badge variant="secondary">Inactivo</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {formatDuration(s.durationMinutes)} · {formatClp(s.priceClp)}
                    {s.description ? ` · ${s.description}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ToggleActive service={s} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Opciones de ${s.name}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(s)
                          setDialogOpen(true)
                        }}
                      >
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg:not([class*='text-'])]:text-destructive"
                        onSelect={() => setDeleting(s)}
                      >
                        <Trash2 />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ServiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        service={editing}
        onSubmit={async (data) => {
          await save.mutateAsync({ id: editing?.id, data })
          toast.success(editing ? 'Servicio actualizado' : 'Servicio creado')
          setDialogOpen(false)
        }}
        saving={save.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="¿Eliminar servicio?"
        description={
          deleting
            ? `"${deleting.name}" dejará de estar disponible. Si tiene citas asociadas te sugeriremos desactivarlo.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            toast.success('Servicio eliminado')
            setDeleting(null)
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar')
          }
        }}
      />
    </div>
  )
}

function ToggleActive({ service }: { service: Service }) {
  const save = useSaveService()
  return (
    <Switch
      checked={service.isActive}
      aria-label={service.isActive ? `Desactivar ${service.name}` : `Activar ${service.name}`}
      onCheckedChange={async (checked) => {
        try {
          await save.mutateAsync({ id: service.id, data: { isActive: checked } })
          toast.success(checked ? 'Servicio activado' : 'Servicio desactivado', {
            description: service.name,
          })
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
        }
      }}
    />
  )
}

function ServiceDialog({
  open,
  onOpenChange,
  service,
  onSubmit,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: Service | null
  onSubmit: (data: ServiceForm & { color: string }) => Promise<void>
  saving: boolean
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { name: '', description: '', durationMinutes: 30, priceClp: 0 },
  })

  const [color, setColor] = useState(COLORS[0]!)

  function openFor(s: Service | null) {
    reset({
      name: s?.name ?? '',
      description: s?.description ?? '',
      durationMinutes: s?.durationMinutes ?? 30,
      priceClp: s?.priceClp ?? 0,
    })
    setColor(s?.color ?? COLORS[0]!)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) openFor(service)
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
          <DialogDescription>Nombre, duración y precio que verán tus clientes.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(async (d) => onSubmit({ ...d, color }))}
          className="grid gap-4"
          noValidate
        >
          <div className="grid gap-2">
            <Label htmlFor="svc-name">Nombre</Label>
            <Input
              id="svc-name"
              placeholder="Ej: Consulta o sesión"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-[13px] text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="svc-duration">Duración (min)</Label>
              <Input
                id="svc-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                aria-invalid={!!errors.durationMinutes}
                {...register('durationMinutes')}
              />
              {errors.durationMinutes && (
                <p className="text-[13px] text-destructive">{errors.durationMinutes.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="svc-price">Precio (CLP)</Label>
              <Input
                id="svc-price"
                type="number"
                min={0}
                step={500}
                aria-invalid={!!errors.priceClp}
                {...register('priceClp')}
              />
              {errors.priceClp && (
                <p className="text-[13px] text-destructive">{errors.priceClp.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="svc-desc">
              Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="svc-desc"
              rows={2}
              placeholder="Ej: Incluye lo básico"
              aria-invalid={!!errors.description}
              {...register('description')}
            />
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Color</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color del servicio">
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
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : service ? 'Guardar cambios' : 'Crear servicio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div
      className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Clock3 className="size-6" />
      </span>
      <h2 className="mt-5 font-semibold tracking-tight">Aún no tienes servicios</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Crea tu primer servicio con su duración y precio. Aparecerá de inmediato en tu
        configuración de reservas.
      </p>
      <Button onClick={onNew} variant="outline" className="mt-5">
        <Plus className="size-4" />
        Crear servicio
      </Button>
    </div>
  )
}
