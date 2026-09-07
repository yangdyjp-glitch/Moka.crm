import { isAxiosError } from 'axios'

export function getErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<{ message?: unknown }>(error)) return fallback
  const message = error.response?.data?.message
  if (typeof message === 'string' && message) return message
  if (Array.isArray(message)) {
    const details = message.filter((item): item is string => typeof item === 'string')
    if (details.length) return details.join('；')
  }
  return fallback
}
