import { eq } from 'drizzle-orm'
import type { Db } from '../client'
import { users } from '../schema'

export interface UserRow {
  id: string
  tenantId: string
  email: string
  passwordHash: string
  name: string
  role: string
  createdAt: string
}

export type UserInsert = typeof users.$inferInsert

export async function insertUser(db: Db, values: UserInsert): Promise<void> {
  await db.insert(users).values(values)
}

export async function getUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return (rows[0] as UserRow) ?? null
}
