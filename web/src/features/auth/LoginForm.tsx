import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { MeResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from './AuthShell'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Ingresa tu email').email('Email inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: (data: LoginForm) =>
      api('/api/auth/login', { method: 'POST', body: data }),
    onSuccess: async () => {
      // El backend setea la cookie; refrescamos la sesión y entramos
      const me = await api<MeResponse>('/api/auth/me')
      qc.setQueryData(['me'], me)
      toast.success('¡Hola de nuevo!')
      navigate(me.tenant.onboardingStep < 4 ? '/onboarding' : '/panel', { replace: true })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión')
    },
  })

  return (
    <AuthShell
      title="Bienvenido de vuelta"
      subtitle="Ingresa a tu panel para gestionar tu agenda"
      footer={
        <>
          ¿Primera vez?{' '}
          <Link to="/registro" className="font-medium text-primary hover:underline">
            Crea tu agenda gratis
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="grid gap-4" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.cl"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && <p className="text-[13px] text-destructive">{errors.email.message}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          {errors.password && (
            <p className="text-[13px] text-destructive">{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" disabled={mutation.isPending} className="mt-1">
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Iniciar sesión
        </Button>
      </form>
    </AuthShell>
  )
}
