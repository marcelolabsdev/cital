import type { Context, Next } from 'hono'
import type { HonoEnv } from '../env'

/** Error de aplicación con código estable para el frontend. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function badRequest(message: string): AppError {
  return new AppError(400, 'bad_request', message)
}

export function unauthorized(message = 'Debes iniciar sesión'): AppError {
  return new AppError(401, 'unauthorized', message)
}

export function notFound(message = 'No encontrado'): AppError {
  return new AppError(404, 'not_found', message)
}

export function conflict(message: string): AppError {
  return new AppError(409, 'conflict', message)
}

export async function errorHandler(err: Error, c: Context<HonoEnv>) {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400)
  }
  console.error('[cital] error no manejado:', err)
  return c.json({ error: { code: 'internal', message: 'Ocurrió un error inesperado' } }, 500)
}
