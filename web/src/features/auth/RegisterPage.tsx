import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from './AuthShell'

const registerSchema = z.object({
  businessName: z.string().trim().min(2, 'Ingresa el nombre de tu negocio'),
  name: z.string().trim().min(2, 'Ingresa tu nombre'),
  email: z.string().trim().min(1, 'Ingresa tu email').email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

type RegisterForm = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { businessName: '', name: '', email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: (data: RegisterForm) =>
      api('/api/auth/register', { method: 'POST', body: data }),
    onSuccess: () => {
      toast.success('¡Cuenta creada! Configuremos tu agenda')
      navigate('/onboarding', { replace: true })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta')
    },
  })

  return (
    <AuthShell
      title="Crea tu agenda"
      subtitle="Tu negocio online en menos de 5 minutos"
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="grid gap-4" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="businessName">Nombre de tu negocio</Label>
          <Input
            id="businessName"
            autoComplete="organization"
            placeholder="Ej: Mi Negocio"
            aria-invalid={!!errors.businessName}
            {...register('businessName')}
          />
          {errors.businessName && (
            <p className="text-[13px] text-destructive">{errors.businessName.message}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">Tu nombre</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Nombre y apellido"
            aria-invalid={!!errors.name}
            {...register('name')}
          />
          {errors.name && <p className="text-[13px] text-destructive">{errors.name.message}</p>}
        </div>
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
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          {errors.password && (
            <p className="text-[13px] text-destructive">{errors.password.message}</p>
          )}
        </div>
        <Button type="submit" disabled={mutation.isPending} className="mt-1">
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Crear mi agenda
        </Button>
      </form>
    </AuthShell>
  )
}
