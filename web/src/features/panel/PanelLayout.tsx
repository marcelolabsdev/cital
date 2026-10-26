import { useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import {
  CalendarDays,
  Users,
  Sparkles,
  UserCog,
  Settings,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  ExternalLink,
  Clock,
} from 'lucide-react'
import { useMe, useLogout } from '@/features/auth/hooks'
import { useTheme } from '@/components/theme'
import { LogoWordmark } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { initialsOf } from '@/lib/format'

const NAV_ITEMS = [
  { to: '/panel', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/panel/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/panel/clientes', label: 'Clientes', icon: Users },
  { to: '/panel/servicios', label: 'Servicios', icon: Sparkles },
  { to: '/panel/equipo', label: 'Equipo', icon: UserCog },
  { to: '/panel/horarios', label: 'Horarios', icon: Clock },
  { to: '/panel/ajustes', label: 'Ajustes', icon: Settings },
]

export function PanelLayout() {
  const { data: me, isLoading, isError } = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (isError) navigate('/login', { replace: true })
  }, [isError, navigate])

  if (isLoading) {
    return (
      <div className="flex min-h-svh">
        <div className="hidden w-60 shrink-0 border-r border-border/70 p-4 lg:block">
          <Skeleton className="h-8 w-28" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-56" />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }
  if (!me) return null

  return (
    <div className="flex min-h-svh bg-muted/30">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-border/70 bg-background lg:flex">
        <div className="px-5 py-5">
          <Link to="/panel" aria-label="Ir al inicio del panel">
            <LogoWordmark />
          </Link>
        </div>
        <SidebarNav items={NAV_ITEMS} />
        <div className="mt-auto p-3">
          <UserMenu me={me} />
        </div>
      </aside>

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar móvil */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/panel">
            <LogoWordmark />
          </Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Abrir menú">
                  <Menu className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {NAV_ITEMS.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>
                      <item.icon />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <UserMenuItems />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Header desktop */}
        <header className="hidden items-center justify-between border-b border-border/70 bg-background px-8 py-4 lg:flex">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">{me.tenant.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href={`/r/${me.tenant.slug}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="size-3.5" />
                Ver mi página
              </Button>
            </a>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarNav({
  items,
}: {
  items: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean }[]
}) {
  return (
    <nav aria-label="Navegación del panel" className="flex flex-col gap-0.5 px-3">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
              'hover:bg-accent hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              isActive && 'bg-accent text-foreground',
            )
          }
        >
          <Icon className="size-[17px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function UserMenu({ me }: { me: NonNullable<ReturnType<typeof useMe>['data']> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card p-2.5 text-left shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Opciones de cuenta"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary">
            {initialsOf(me.user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{me.user.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <UserMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenuItems() {
  const logout = useLogout()
  const { resolved, setTheme } = useTheme()
  return (
    <>
      <DropdownMenuLabel>Sesión</DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={() => {
          setTheme(resolved === 'dark' ? 'light' : 'dark')
        }}
      >
        {resolved === 'dark' ? <Sun /> : <Moon />}
        Cambiar a modo {resolved === 'dark' ? 'claro' : 'oscuro'}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg:not([class*='text-'])]:text-destructive"
        onSelect={() => logout.mutate(undefined, { onSuccess: () => (window.location.href = '/login') })}
      >
        <LogOut />
        Cerrar sesión
      </DropdownMenuItem>
    </>
  )
}

function ThemeToggle() {
  const { resolved, setTheme } = useTheme()
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
      aria-label={resolved === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
