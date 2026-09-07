import { useCallback, useEffect, useState } from 'react'

/** Keep loaders stable (module scope or useCallback); reload from user/mutation events. */
export function useRemoteData<T>(loader: () => Promise<T>, initialData: T) {
  const [initialValue] = useState(() => initialData)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{
    loader: (() => Promise<T>) | null
    revision: number
    data: T
    error: unknown
  }>({ loader: null, revision: -1, data: initialData, error: null })

  useEffect(() => {
    let active = true
    async function fetchData() {
      try {
        const data = await loader()
        if (active) setResult({ loader, revision, data, error: null })
      } catch (error) {
        if (active) setResult((previous) => ({
          loader,
          revision,
          data: previous.loader === loader ? previous.data : initialValue,
          error,
        }))
      }
    }
    void fetchData()
    return () => { active = false }
  }, [loader, revision, initialValue])

  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const loading = result.loader !== loader || result.revision !== revision
  const data = result.loader === loader ? result.data : initialValue
  return { data, loading, error: loading ? null : result.error, reload }
}
