import 'server-only'
import { randomUUID } from 'node:crypto'
import { cache } from 'react'
import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { pool } from './db'

const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter(Boolean)
  .map((host) => `https://${host}`)
const extraOrigins = [process.env.APP_URL, process.env.BETTER_AUTH_URL].filter((value): value is string => !!value)

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? (productionUrl ? `https://${productionUrl}` : 'http://localhost:3000'),
  trustedOrigins: ['http://localhost:3000', ...vercelOrigins, ...extraOrigins],
  // GavIA no tiene usuarios finales con cuenta: NO hay registro público. Las cuentas las crea el servidor
  // (aprobación de un balneario, staff sumado por el dueño, equipo de la plataforma).
  emailAndPassword: { enabled: true, disableSignUp: true, autoSignIn: false, minPasswordLength: 8 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  // Los ids son UUID: las políticas RLS de la v2.1 usan auth.uid() (uuid) y la base los espeja en auth.users.
  advanced: { database: { generateId: () => randomUUID() } },
  user: {
    additionalFields: {
      // input:false → nadie puede setearlos desde la API pública.
      role: { type: 'string', defaultValue: 'member', input: false },
      mustChangePassword: { type: 'boolean', defaultValue: false, input: false },
      tempPasswordExpiresAt: { type: 'date', required: false, input: false },
    },
  },
  plugins: [nextCookies()],
})

export type SessionUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string
  mustChangePassword: boolean
  tempPasswordExpiresAt: Date | null
}

/** Usuario logueado o null (una vez por request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() })
  if (!result?.user) return null
  const u = result.user as typeof result.user & Partial<SessionUser>
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: !!u.emailVerified,
    role: u.role ?? 'member',
    mustChangePassword: !!u.mustChangePassword,
    tempPasswordExpiresAt: u.tempPasswordExpiresAt ? new Date(u.tempPasswordExpiresAt) : null,
  }
})
