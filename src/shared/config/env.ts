function optional(value: string | undefined) {
  return value?.trim() ?? ''
}

export const env = {
  googleAndroidClientId: optional(
    import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID,
  ),
  googleWebClientId: optional(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID),
} as const