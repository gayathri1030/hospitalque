const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
const API_URL = (configuredApiUrl || (import.meta.env.DEV ? 'http://localhost:4000' : '')).replace(/\/$/, '')

export async function api(path, { token, ...options } = {}) {
  if (!API_URL) {
    throw new Error('The API is not configured. Set the VITE_API_URL repository variable to your backend origin.')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body
}

export const apiBaseUrl = API_URL
