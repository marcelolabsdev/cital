import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Copy, Globe, Loader2, Store } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { MeResponse } from '@/lib/types'
import { useMe } from '@/features/auth/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogoWordmark } from '@/components/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { slugify } from '@/lib/slug'

const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa el nombre de tu negocio'),
  slug: z
    .string()
    .trim()
    .min(3, 'El enlace debe tener al menos 3 caracteres')
    .max(48, 'Máximo 48 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Solo letras, números y guiones'),
  description: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
  timezone: z.string(),
})

type OnboardingForm = z.infer<typeof onboardingSchema>

const TIMEZONES = [
  { value: 'America/Santiago', label: 'Continental (Santiago)' },
  { value: 'America/Punta_Arenas', label: 'Magallanes (Punta Arenas)' },
  { value: 'America/EasterIsland', label: 'Isla de Pascua' },
]

export function OnboardingPage() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="border-b border-border/70 bg-background px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <LogoWordmark />
          <span className="text-sm text-muted-foreground">Configuración inicial</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <OnboardingWizard />
      </main>
    </div>
  )
}

function OnboardingWizard() {
  const { data: me, isLoading, isError } = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (isError) navigate('/login', { replace: true })
  }, [isError, navigate])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }
  if (!me) return null

  return <StepBusiness key={me.tenant.id} me={me} />
}

function StepBusiness({ me }: { me: MeResponse }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle')

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: me.tenant.name,
      slug: me.tenant.slug,
      description: me.tenant.description ?? '',
      timezone: me.tenant.timezone,
    },
  })

  const slug = watch('slug')
  const businessName = watch('name')

  // Al cambiar el nombre, sugiere slug si el usuario no lo editó manualmente
  const [slugTouched, setSlugTouched] = useState(true)
  useEffect(() => {
    if (!slugTouched) setValue('slug', slugify(businessName))
  }, [businessName, slugTouched, setValue])

  // Chequeo de disponibilidad del slug (debounce)
  useEffect(() => {
    const clean = slug.trim()
    if (!clean) return
    if (!/^[a-z0-9-]{3,48}$/.test(clean) || clean !== slugify(clean)) {
      setSlugStatus('invalid')
      return
    }
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      try {
        const res = await api<{ available: boolean }>(
          `/api/public/slug-check?slug=${encodeURIComponent(clean)}`,
        )
        // Disponible para mí si nadie lo tiene o soy yo mismo
        setSlugStatus(res.available || clean === me.tenant.slug ? 'ok' : 'taken')
      } catch {
        setSlugStatus('idle')
      }
    }, 450)
    return () => clearTimeout(t)
  }, [slug, me.tenant.slug])

  const mutation = useMutation({
    mutationFn: (data: OnboardingForm) =>
      api<{ tenant: MeResponse['tenant'] }>('/api/panel/onboarding', {
        method: 'PATCH',
        body: { ...data, onboardingStep: 4 },
      }),
    onSuccess: (res) => {
      qc.setQueryData(['me'], { ...me, tenant: res.tenant })
      toast.success('Listo. ¡Bienvenido a cital!')
      navigate('/panel', { replace: true })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
    },
  })

  const canSubmit = slugStatus === 'ok' || slugStatus === 'idle'

  return (
    <div
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-[13px] font-medium text-muted-foreground shadow-sm">
        <Store className="size-3.5 text-primary" />
        Paso 1 de 1 · Datos del negocio
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Hola, {me.user.name.split(' ')[0]} · cuéntanos de tu negocio
      </h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        Con esto creamos tu página de reservas. Podrás cambiarlo después en Ajustes.
      </p>

      <form
        onSubmit={handleSubmit((d) => canSubmit && mutation.mutate(d))}
        className="mt-8 grid gap-5 rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8"
        noValidate
      >
        <div className="grid gap-2">
          <Label htmlFor="name">Nombre del negocio</Label>
          <Input id="name" autoComplete="organization" aria-invalid={!!errors.name} {...register('name')} />
          {errors.name && <p className="text-[13px] text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="slug">Tu enlace de reservas</Label>
          <div className="flex items-stretch">
            <span className="flex items-center whitespace-nowrap rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              /r/
            </span>
            <Input
              id="slug"
              className="rounded-l-none font-mono text-[13px]"
              aria-invalid={slugStatus === 'invalid' || slugStatus === 'taken'}
              {...register('slug', { onChange: () => setSlugTouched(true) })}
            />
          </div>
          {slugStatus === 'checking' && (
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Verificando…
            </p>
          )}
          {slugStatus === 'ok' && (
            <p className="text-[13px] text-emerald-600 dark:text-emerald-400">Enlace disponible</p>
          )}
          {slugStatus === 'taken' && (
            <p className="text-[13px] text-destructive">Ese enlace ya está tomado, prueba otro</p>
          )}
          {slugStatus === 'invalid' && (
            <p className="text-[13px] text-destructive">
              Usa solo letras minúsculas, números y guiones (3 a 48 caracteres)
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">
            Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="description"
            placeholder="Ej: Atención con hora previa en Providencia"
            aria-invalid={!!errors.description}
            {...register('description')}
          />
          {errors.description && (
            <p className="text-[13px] text-destructive">{errors.description.message}</p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="timezone">Zona horaria</Label>
          <select
            id="timezone"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            {...register('timezone')}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Globe className="size-4 shrink-0 text-primary" />
            <p className="truncate text-[13px] text-muted-foreground">
              Tu página quedará en <span className="font-medium text-foreground">/r/{slug || '…'}</span>
            </p>
          </div>
          <CopyButton text={`/r/${slug ?? ''}`} />
        </div>

        <Button type="submit" size="lg" disabled={mutation.isPending || !canSubmit} className="mt-2">
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar e ir al panel
          <Check className="size-4" />
        </Button>
      </form>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      aria-label="Copiar enlace"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  )
}
