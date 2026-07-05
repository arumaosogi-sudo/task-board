// Search API client + debounced React Query hook.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export interface SearchProjectHit {
  id: string
  name: string
  description: string
}
export interface SearchFileHit {
  fileId: string
  fileName: string
  projectId: string
  projectName: string
}
export interface SearchContentHit extends SearchFileHit {
  snippet: string
}
export interface SearchResults {
  projects: SearchProjectHit[]
  files: SearchFileHit[]
  contents: SearchContentHit[]
}

const EMPTY: SearchResults = { projects: [], files: [], contents: [] }

const SearchApi = {
  query: (q: string) => api.get<SearchResults>('/search', { params: { q } }).then((r) => r.data),
}

/** Debounce a fast-changing value (e.g. a search box) by `delay` ms. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** Runs a scoped search once the (debounced) query is ≥ 2 chars. */
export function useSearch(query: string) {
  const q = query.trim()
  const enabled = q.length >= 2
  const result = useQuery({
    queryKey: ['search', q],
    queryFn: () => SearchApi.query(q),
    enabled,
    staleTime: 15_000,
  })
  return { ...result, data: enabled ? result.data ?? EMPTY : EMPTY, enabled }
}
