import { Toaster as SonnerToaster } from 'sonner'
import { useTheme } from '@/components/theme'

/** Toaster global conectado al tema de la app. */
export function Toaster() {
  const { resolved } = useTheme()
  return (
    <SonnerToaster
      theme={resolved}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'rounded-xl! border-border/70! shadow-lg!',
          description: 'text-muted-foreground!',
        },
      }}
    />
  )
}
