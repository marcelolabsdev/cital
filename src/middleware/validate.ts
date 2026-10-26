import type { z } from 'zod'
import type { Context } from 'hono'
import { AppError } from './errors'

/** Valida el cuerpo JSON de una petición con Zod; devuelve datos tipados. */
export async function parseBody<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let json: unknown
  try {
    json = await c.req.json()
  } catch {
    throw new AppError(400, 'invalid_json', 'El cuerpo debe ser JSON válido')
  }
  const result = schema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new AppError(422, 'validation', issue?.message ?? 'Datos inválidos')
  }
  return result.data
}
