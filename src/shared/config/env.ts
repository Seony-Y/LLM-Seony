function optional(value: string | undefined) {
  return value?.trim() ?? ''
}

export const env = {
  serverUrl: optional(import.meta.env.VITE_SERVER_URL).replace(/\/+$/, ''),
} as const
