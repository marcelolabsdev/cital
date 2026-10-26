import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { LogoWordmark } from '@/components/logo'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <LogoWordmark />
      <div>
        <p className="text-sm font-medium text-muted-foreground">Error 404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Página no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La dirección que buscas no existe o fue movida.
        </p>
      </div>
      <Button asChild>
        <Link to="/">Volver al inicio</Link>
      </Button>
    </div>
  )
}
