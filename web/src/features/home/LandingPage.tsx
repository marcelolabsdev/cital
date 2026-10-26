import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { CalendarCheck, Bell, Clock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoWordmark } from '@/components/logo'
import { useMe } from '@/features/auth/hooks'

export function LandingPage() {
  const navigate = useNavigate()
  const { data: me, isSuccess } = useMe()

  useEffect(() => {
    if (isSuccess && me) navigate('/panel', { replace: true })
  }, [isSuccess, me, navigate])

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      {/* fondo sutil */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[420px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent blur-3xl"
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <LogoWordmark />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to="/login">Iniciar sesión</Link>
          </Button>
          <Button asChild>
            <Link to="/registro">Crear mi agenda</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 pb-24 pt-16 text-center md:pt-24">
        <div
          className="flex flex-col items-center"
        >
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground shadow-sm">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Hecho en Chile, para negocios chilenos
          </span>
          <h1 className="max-w-3xl text-balance text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl">
            Tu agenda completa,{' '}
            <span className="text-primary">sin planillas</span>{' '}
            ni mensajes perdidos
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
            Recibe reservas las 24 horas desde tu propia página, con recordatorios
            automáticos y un calendario que trabaja por ti.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/registro">
                Empezar gratis
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Ya tengo cuenta</Link>
            </Button>
          </div>
        </div>

        <div
          className="mt-20 grid w-full max-w-3xl gap-4 sm:grid-cols-3"
        >
          {[
            {
              icon: CalendarCheck,
              title: 'Reservas 24/7',
              text: 'Tus clientes agendan solos desde el celular, sin llamadas.',
            },
            {
              icon: Bell,
              title: 'Recordatorios',
              text: 'Menos ausencias con avisos automáticos por email.',
            },
            {
              icon: Clock,
              title: 'Configura en 5 minutos',
              text: 'Servicios, equipo y horarios listos en pocos pasos.',
            },
          ].map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-xl border border-border/70 bg-card/80 p-5 text-left shadow-sm backdrop-blur"
            >
              <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-[18px]" />
              </span>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-8 text-center text-[13px] text-muted-foreground">
        cital · Agenda online para barberías, clínicas, estéticas y más
      </footer>
    </div>
  )
}
