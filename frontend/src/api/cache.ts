import axios, { type AxiosInstance, type AxiosResponse } from 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    noCache?: boolean
  }
}

/** Use Axios' adapter boundary so cached GETs retain normal request/response typing. */
export function installGetCache(client: AxiosInstance, now = Date.now) {
  const entries = new Map<string, { time: number; response: AxiosResponse<unknown> }>()
  const requestVersions = new Map<string, number>()
  const ttl = 30 * 60 * 1000
  let generation = 0
  const clear = () => {
    generation += 1
    entries.clear()
    requestVersions.clear()
  }

  client.interceptors.request.use((config) => {
    if ((config.method ?? 'get').toLowerCase() !== 'get' || config.responseType === 'blob' || config.noCache) {
      return config
    }
    const key = `${config.baseURL ?? ''}|${config.url}|${JSON.stringify(config.params ?? {})}`
    const adapter = axios.getAdapter(config.adapter ?? client.defaults.adapter)
    const requestGeneration = generation
    config.adapter = async (request) => {
      const hit = entries.get(key)
      if (hit && now() - hit.time < ttl) {
        return { ...hit.response, data: structuredClone(hit.response.data), config: request }
      }
      const requestVersion = (requestVersions.get(key) ?? 0) + 1
      requestVersions.set(key, requestVersion)
      const response: AxiosResponse<unknown> = await adapter(request)
      // Successful writes invalidate in-flight reads; older reads cannot replace a
      // later request for the same key when responses arrive out of order.
      if (
        requestGeneration === generation &&
        requestVersions.get(key) === requestVersion &&
        !request.signal?.aborted &&
        response.status >= 200 && response.status < 300
      ) {
        // Axios transforms the response after the adapter returns. Keep an independent
        // raw snapshot so a cache hit never transforms the previous result twice.
        try {
          entries.set(key, { time: now(), response: { ...response, data: structuredClone(response.data) } })
        } catch {
          // Streams and other non-cloneable responses are delivered without caching.
        }
      }
      return response
    }
    return config
  })

  client.interceptors.response.use((response) => {
    if ((response.config.method ?? 'get').toLowerCase() !== 'get') clear()
    return response
  })
  return clear
}
