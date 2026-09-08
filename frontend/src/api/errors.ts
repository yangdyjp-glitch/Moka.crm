import { isAxiosError } from 'axios'

function serverErrorMessage(error: unknown): string | undefined {
  if (!isAxiosError<{ message?: unknown }>(error)) return undefined
  const message = error.response?.data?.message
  if (typeof message === 'string' && message.trim()) return message
  if (Array.isArray(message)) {
    const details = message.filter((item): item is string => typeof item === 'string' && !!item.trim())
    if (details.length) return details.join('；')
  }
  return undefined
}

/** Moka callers use their localized fallback for network and non-API failures. */
export function getErrorMessage(error: unknown, fallback: string): string {
  return serverErrorMessage(error) ?? fallback
}

/** TY pages also surface locally-created business validation errors. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return serverErrorMessage(error) ?? (error instanceof Error && error.message ? error.message : fallback)
}
