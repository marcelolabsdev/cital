import { useState } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Plus, Pencil, Trash2, UserCog, CalendarClock } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { initialsOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DEFAULT_ENTITY_COLOR } from '@/lib/brand'
import {
  useDeleteProfessional,
  useProfessionals,
  useSaveProfessional,
  useServices,
  type Professional,
} from '@/features/panel/hooks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ProfessionalDialog } from './ProfessionalDialog'

export function TeamPage() {
  const { data: team, isLoading } = useProfessionals()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Professional | null>(null)
  const [deleting, setDeleting] = useState<Professional | null>(null)
  const remove = useDeleteProfessional()

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Profesionales o recursos que atienden, con sus servicios y horarios.
          </p>
        </div>
        <Button
          className="shrink-0"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" />
          Agregar
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : !team || team.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UserCog className="size-6" />
          </span>
          <h2 className="mt-5 font-semibold tracking-tight">Tu equipo está vacío</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Agrega a quienes atienden en tu negocio y define qué servicios realiza cada uno.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Agregar integrante
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {team.map((p, i) => (
            <div
              key={p.id}
            >
              <div
                className={cn(
                  'flex h-full flex-col rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-colors hover:border-border',
                  !p.isActive && 'opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: `${p.color ?? DEFAULT_ENTITY_COLOR}1a`,
                        color: p.color ?? DEFAULT_ENTITY_COLOR,
                      }}
                    >
                      {initialsOf(p.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{p.name}</p>
                        {!p.isActive && <Badge variant="secondary">Inactivo</Badge>}
                      </div>
                      {p.phone && <p className="truncate text-sm text-muted-foreground">{p.phone}</p>}
                    </div>
                  </div>
                  <TeamMemberMenu member={p} onEdit={() => { setEditing(p); setDialogOpen(true) }} onDelete={() => setDeleting(p)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.serviceIds.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      Sin servicios asignados aún
                    </p>
                  ) : (
                    p.serviceIds.map((sid) => (
                      <ServiceChip key={sid} serviceId={sid} />
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfessionalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        professional={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="¿Eliminar integrante?"
        description={
          deleting
            ? `"${deleting.name}" dejará de aparecer en tu equipo. Si tiene citas asociadas, te sugeriremos desactivarlo.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            toast.success('Integrante eliminado')
            setDeleting(null)
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar')
          }
        }}
      />
    </div>
  )
}

function ServiceChip({ serviceId }: { serviceId: string }) {
  const { data: services } = useServices()
  const svc = services?.find((s) => s.id === serviceId)
  if (!svc) return null
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: svc.color ?? DEFAULT_ENTITY_COLOR }}
        aria-hidden="true"
      />
      {svc.name}
    </Badge>
  )
}

function TeamMemberMenu({
  member,
  onEdit,
  onDelete,
}: {
  member: Professional
  onEdit: () => void
  onDelete: () => void
}) {
  const save = useSaveProfessional()
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Switch
        checked={member.isActive}
        aria-label={member.isActive ? `Desactivar a ${member.name}` : `Activar a ${member.name}`}
        onCheckedChange={async (checked) => {
          try {
            await save.mutateAsync({ id: member.id, data: { isActive: checked } })
            toast.success(checked ? 'Integrante activado' : 'Integrante desactivado', {
              description: member.name,
            })
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
          }
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Opciones de ${member.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg:not([class*='text-'])]:text-destructive"
            onSelect={onDelete}
          >
            <Trash2 />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
