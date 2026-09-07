import axios from 'axios'

type ApiErrorBody = {
  message?: string | string[]
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join('；')
    if (typeof message === 'string' && message.trim()) return message
  }
  return error instanceof Error && error.message ? error.message : fallback
}
