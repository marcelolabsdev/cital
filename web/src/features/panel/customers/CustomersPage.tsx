import { useState } from 'react'
import { toast } from 'sonner'
import {
  Download,
  Loader2,
  MessageCircle,
  Search,
  UserRound,
  Users,
} from 'lucide-react'
import { ApiError } from '@/lib/api'
import { formatClp, initialsOf, waLink } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  useCustomerDetail,
  useCustomers,
  useUpdateCustomer,
} from '@/features/panel/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function CustomersPage() {
  const [q, setQ] = useState('')
  const { data: customers, isLoading } = useCustomers(q)
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Quienes te han reservado, con su historial y notas internas.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/api/panel/customers/export.csv" download>
            <Download className="size-4" />
            Exportar CSV
          </a>
        </Button>
      </div>

      <div className="relative mt-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, teléfono o email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar clientes"
        />
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !customers || customers.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="size-6" />
          </span>
          <h2 className="mt-5 font-semibold tracking-tight">
            {q ? 'Sin resultados' : 'Aún no tienes clientes'}
          </h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            {q
              ? 'Nadie coincide con tu búsqueda. Prueba con otro nombre o teléfono.'
              : 'Cuando recibas tu primera reserva, el cliente aparecerá acá automáticamente.'}
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {customers.map((c, i) => (
            <li
              key={c.id}
            >
              <button
                onClick={() => setSelected(c.id)}
                className="flex w-full items-center gap-3.5 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:border-border hover:bg-accent/30"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary">
                  {initialsOf(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {c.phone ?? c.email ?? '—'}
                  </span>
                </span>
                <Badge variant="secondary">{c.appointmentsCount} citas</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CustomerDialog customerId={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function CustomerDialog({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const { data, isLoading } = useCustomerDetail(customerId)
  const update = useUpdateCustomer()
  const [notes, setNotes] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const customer = data?.customer
  const history = data?.history ?? []
  const notesValue = notes ?? customer?.notes ?? ''

  return (
    <Dialog open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {isLoading || !customer ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initialsOf(customer.name)}
                </span>
                <span className="min-w-0 truncate">{customer.name}</span>
              </DialogTitle>
              <DialogDescription>
                Cliente desde {new Date(customer.createdAt).toLocaleDateString('es-CL')}
                {customer.phone ? ` · ${customer.phone}` : ''}
                {customer.email ? ` · ${customer.email}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5">
              {/* Acciones rápidas */}
              {customer.phone && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={waLink(customer.phone)} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-3.5" />
                      WhatsApp
                    </a>
                  </Button>
                </div>
              )}

              {/* Historial */}
              <section aria-label="Historial de citas">
                <h3 className="text-sm font-semibold">Historial de citas</h3>
                {history.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">
                    Sin citas registradas todavía.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                    {history.map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-[13px]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{h.serviceName}</span>
                          <span className="block text-muted-foreground">
                            {new Intl.DateTimeFormat('es-CL', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZone: 'America/Santiago',
                              hour12: false,
                            }).format(new Date(h.startAt))}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-muted-foreground">{formatClp(h.priceClp)}</span>
                          <HistoryStatus status={h.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Notas internas */}
              <section aria-label="Notas internas">
                <Label htmlFor="cust-notes" className="text-sm font-semibold">
                  Notas internas
                </Label>
                <Textarea
                  id="cust-notes"
                  rows={3}
                  className="mt-2"
                  placeholder="Preferencias, alergias, acuerdos… (solo tu equipo lo ve)"
                  value={notesValue}
                  onChange={(e) => setNotes(e.target.value)}
                />
                {notes !== null && notes !== (customer.notes ?? '') && (
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true)
                      try {
                        await update.mutateAsync({ id: customer.id, notes: notesValue })
                        toast.success('Notas guardadas')
                        setNotes(null)
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    {saving && <Loader2 className="size-3.5 animate-spin" />}
                    Guardar notas
                  </Button>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function HistoryStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-amber-500/10 text-amber-600' },
    confirmed: { label: 'Confirmada', cls: 'bg-emerald-500/10 text-emerald-600' },
    completed: { label: 'Completada', cls: 'bg-sky-500/10 text-sky-600' },
    cancelled: { label: 'Cancelada', cls: 'bg-destructive/10 text-destructive' },
    no_show: { label: 'No asistió', cls: 'bg-muted text-muted-foreground' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', s.cls)}>{s.label}</span>
  )
}
