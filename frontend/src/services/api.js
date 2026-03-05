const BASE_URL = '/api/v1'

class ApiError extends Error {
  constructor(status, message, retryAfter = null) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

async function request(path, options = {}, shadowId) {
  const headers = {
    'Content-Type': 'application/json',
    ...(shadowId ? { 'X-Shadow-ID': shadowId } : {}),
    ...(options.headers || {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const retryAfter = res.headers.get('Retry-After')
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch (_) {}
    throw new ApiError(res.status, detail, retryAfter ? parseInt(retryAfter) : null)
  }

  return res.json()
}

export function createApiService(shadowId) {
  return {
    async startScan(url) {
      return request('/analyze/start', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }, shadowId)
    },

    async getScan(scanId) {
      return request(`/analyze/${scanId}`, {}, shadowId)
    },

    async getHistory(page = 1, limit = 10) {
      return request(`/analyze/history?page=${page}&limit=${limit}`, {}, shadowId)
    },

    async getSessionStats() {
      return request('/session/stats', {}, shadowId)
    },
  }
}

export { ApiError }
