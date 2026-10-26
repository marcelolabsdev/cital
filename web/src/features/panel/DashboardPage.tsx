import { Link } from 'react-router'
import { ArrowRight, Banknote, CalendarDays, Percent, Sparkles, TrendingUp } from 'lucide-react'
import { useDashboard } from '@/features/panel/hooks'
import { useMe } from '@/features/auth/hooks'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatClp } from '@/lib/format'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const { data: me } = useMe()
  const { data, isLoading } = useDashboard()

  if (!me) return null
  const firstName = me.user.name.split(' ')[0]
  const configured = me.tenant.onboardingStep >= 4

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {firstName}</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Así va tu negocio hoy.
        </p>
      </div>

      {!configured && (
        <Card className="mt-6 border-primary/25 bg-primary/[0.04]">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-[18px]" />
              </span>
              <div>
                <p className="text-sm font-semibold">Completa tu configuración</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Configura tus datos y empieza a recibir reservas online.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link to="/onboarding">
                Continuar
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading || !data ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <MetricCard
              delay={0.05}
              icon={<CalendarDays className="size-4" />}
              label="Citas de hoy"
              value={String(data.today.appointments.length)}
              hint={
                data.today.appointments.length === 0
                  ? 'Nada agendado para hoy'
                  : 'Próxima: ' + nextTodayLabel(data)
              }
            />
            <MetricCard
              delay={0.1}
              icon={<Banknote className="size-4" />}
              label="Ingresos estimados (mes)"
              value={formatClp(data.month.estimatedRevenueClp)}
              hint={`${data.month.upcomingCount} próximas · ${data.month.completedCount} completadas`}
            />
            <MetricCard
              delay={0.15}
              icon={<Percent className="size-4" />}
              label="Tasa de cancelación"
              value={`${data.month.cancellationRate}%`}
              hint={`${data.month.cancelledCount} cancelaciones este mes`}
              tone={data.month.cancellationRate > 25 ? 'warn' : 'default'}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* Citas de hoy */}
            <section
              className="rounded-xl border border-border/70 bg-card shadow-sm"
              aria-label="Agenda de hoy"
            >
              <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <h2 className="text-sm font-semibold">Agenda de hoy</h2>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/panel/calendario">
                    Ver calendario <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </header>
              {data.today.appointments.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-10 text-center">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-muted">
                    <CalendarDays className="size-5 text-muted-foreground" />
                  </span>
                  <p className="mt-3 text-sm font-medium">Día despejado</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    No hay citas para hoy. Comparte tu enlace para recibir reservas.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {data.today.appointments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">
                        {new Intl.DateTimeFormat('es-CL', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'America/Santiago',
                          hour12: false,
                        }).format(new Date(a.startAt))}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.customerName}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {a.serviceName} · {a.professionalName}
                        </span>
                      </span>
                      <TodayStatus status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Top servicios */}
            <section
              className="rounded-xl border border-border/70 bg-card shadow-sm"
              aria-label="Servicios más pedidos"
            >
              <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <h2 className="text-sm font-semibold">Servicios más pedidos</h2>
                <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
              </header>
              {data.month.topServices.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-10 text-center">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-muted">
                    <Sparkles className="size-5 text-muted-foreground" />
                  </span>
                  <p className="mt-3 text-sm font-medium">Sin datos aún</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Cuando lleguen reservas verás cuáles son tus servicios estrella.
                  </p>
                </div>
              ) : (
                <ul className="px-5 py-4">
                  {data.month.topServices.map((s, i) => {
                    const max = data.month.topServices[0]!.count
                    return (
                      <li key={s.name} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium">{s.name}</span>
                          <span className="shrink-0 text-muted-foreground">{s.count}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${(s.count / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function nextTodayLabel(data: NonNullable<ReturnType<typeof useDashboard>['data']>): string {
  const next = data.today.appointments.find((a) => a.status !== 'completed')
  if (!next) return 'todo completado'
  const time = new Intl.DateTimeFormat('es-CL', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Santiago',
    hour12: false,
  }).format(new Date(next.startAt))
  return `${time} ${next.customerName.split(' ')[0]}`
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  delay,
  tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  delay: number
  tone?: 'default' | 'warn'
}) {
  return (
    <div>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-lg',
                tone === 'warn' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary',
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </div>
  )
}

function TodayStatus({ status }: { status: string }) {
  if (status === 'completed') return <Badge variant="success">Completada</Badge>
  if (status === 'pending') return <Badge variant="warning">Pendiente</Badge>
  return <Badge>Confirmada</Badge>
}
