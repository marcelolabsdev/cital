import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useMe } from '@/features/auth/hooks'
import type { MeResponse, Tenant } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { slugify } from '@/lib/slug'

const TIMEZONES = [
  { value: 'America/Santiago', label: 'Continental (Santiago)' },
  { value: 'America/Punta_Arenas', label: 'Magallanes (Punta Arenas)' },
  { value: 'America/EasterIsland', label: 'Isla de Pascua' },
]

const BRAND_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6']

const settingsSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa el nombre del negocio'),
  slug: z
    .string()
    .trim()
    .min(3, 'Mínimo 3 caracteres')
    .max(48, 'Máximo 48 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
  description: z.string().trim().max(300, 'Máximo 300 caracteres'),
  timezone: z.string(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido'),
  cancellationPolicyHours: z.coerce
    .number({ invalid_type_error: 'Ingresa las horas' })
    .int('Debe ser un número entero')
    .min(0, 'No puede ser negativo')
    .max(168, 'Máximo una semana (168 h)'),
  cancellationPolicyMode: z.enum(['hours', 'no_refund']),
})

type SettingsForm = z.infer<typeof settingsSchema>

export function SettingsPage() {
  const { data: me, isLoading } = useMe()

  if (isLoading || !me) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }
  return <SettingsFormPage me={me} />
}

function SettingsFormPage({ me }: { me: MeResponse }) {
  const qc = useMe()
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle')
  const [color, setColor] = useState(me.tenant.brandColor)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: me.tenant.name,
      slug: me.tenant.slug,
      description: me.tenant.description ?? '',
      timezone: me.tenant.timezone,
      brandColor: me.tenant.brandColor,
      cancellationPolicyHours: me.tenant.cancellationPolicyHours,
      cancellationPolicyMode: me.tenant.cancellationPolicyMode,
    },
  })

  const slug = watch('slug')

  // Chequeo de disponibilidad del slug (debounce)
  useEffect(() => {
    const clean = slug?.trim() ?? ''
    if (!clean) {
      setSlugStatus('idle')
      return
    }
    if (!/^[a-z0-9-]{3,48}$/.test(clean) || clean !== slugify(clean)) {
      setSlugStatus('invalid')
      return
    }
    setSlugStatus('checking')
    const t = setTimeout(() => {
      api<{ available: boolean }>(`/api/public/slug-check?slug=${encodeURIComponent(clean)}`)
        .then((res) => setSlugStatus(res.available || clean === me.tenant.slug ? 'ok' : 'taken'))
        .catch(() => setSlugStatus('idle'))
    }, 450)
    return () => clearTimeout(t)
  }, [slug, me.tenant.slug])

  async function onSubmit(data: SettingsForm) {
    if (slugStatus === 'taken' || slugStatus === 'invalid') {
      toast.error('Corrige el enlace público antes de guardar')
      return
    }
    try {
      const res = await api<{ tenant: Tenant }>('/api/panel/onboarding', {
        method: 'PATCH',
        body: { ...data, description: data.description || null },
      })
      if (qc.data) {
        qc.refetch()
      }
      toast.success('Ajustes guardados')
      void res
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Marca, enlace público y políticas de reserva.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 grid gap-5 rounded-2xl border border-border/70 bg-card p-6 shadow-sm" noValidate>
        <div className="grid gap-2">
          <Label htmlFor="st-name">Nombre del negocio</Label>
          <Input id="st-name" aria-invalid={!!errors.name} {...register('name')} />
          {errors.name && <p className="text-[13px] text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="st-slug">Enlace público de reservas</Label>
          <div className="flex items-stretch">
            <span className="flex items-center whitespace-nowrap rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              /r/
            </span>
            <Input id="st-slug" className="rounded-l-none font-mono text-[13px]" aria-invalid={slugStatus === 'invalid' || slugStatus === 'taken'} {...register('slug')} />
          </div>
          {slugStatus === 'checking' && (
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Verificando…
            </p>
          )}
          {slugStatus === 'ok' && <p className="text-[13px] text-emerald-600 dark:text-emerald-400">Enlace disponible</p>}
          {slugStatus === 'taken' && <p className="text-[13px] text-destructive">Ese enlace ya está tomado</p>}
          {slugStatus === 'invalid' && <p className="text-[13px] text-destructive">Solo minúsculas, números y guiones (3-48)</p>}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="st-desc">Descripción</Label>
          <Textarea id="st-desc" rows={2} placeholder="Se muestra en tu página de reservas" aria-invalid={!!errors.description} {...register('description')} />
          {errors.description && <p className="text-[13px] text-destructive">{errors.description.message}</p>}
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Color de marca</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de marca">
            {BRAND_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  'size-8 rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  color === c && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <input type="hidden" value={color} {...register('brandColor')} />
        </fieldset>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="st-tz">Zona horaria</Label>
            <NativeSelect id="st-tz" {...register('timezone')}>
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-mode">Política de cancelación</Label>
            <NativeSelect id="st-mode" {...register('cancellationPolicyMode')}>
              <option value="hours">Con anticipación mínima</option>
              <option value="no_refund">Sin reembolso</option>
            </NativeSelect>
          </div>
        </div>

        {watch('cancellationPolicyMode') === 'hours' && (
          <div className="grid gap-2">
            <Label htmlFor="st-cancel">Cancelación anticipada (horas)</Label>
            <Input id="st-cancel" type="number" min={0} max={168} className="max-w-40" aria-invalid={!!errors.cancellationPolicyHours} {...register('cancellationPolicyHours')} />
            {errors.cancellationPolicyHours && (
              <p className="text-[13px] text-destructive">{errors.cancellationPolicyHours.message}</p>
            )}
            <p className="text-[13px] text-muted-foreground">
              Se muestra a tus clientes como «puedes cancelar hasta N horas antes».
            </p>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-4">
          <a
            href={`/r/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span className="truncate">Ver /r/{slug}</span>
          </a>
          <CopyBtn text={`/r/${slug}`} />
        </div>

        <div className="flex justify-end border-t border-border/60 pt-4">
          <Button type="submit" disabled={!isDirty}>
            <Check className="size-4" />
            Guardar ajustes
          </Button>
        </div>
      </form>
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
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
