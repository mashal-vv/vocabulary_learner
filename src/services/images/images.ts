import { functionsUrl, isSupabaseConfigured } from '@/services/supabase/client'

export type ImageResult = {
  url?: string
  caption?: string
}

export async function findContextualImage(query: string, useful: boolean): Promise<ImageResult> {
  if (!useful) return {}
  if (isSupabaseConfigured()) {
    const endpoint = functionsUrl('search-image')
    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ query }),
        })
        if (response.ok) {
          const json = (await response.json()) as ImageResult
          if (json.url) return json
        }
      } catch {
        // Fall through to Wikipedia.
      }
    }
  }
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) return {}
    const json = (await response.json()) as {
      type?: string
      thumbnail?: { source?: string }
      description?: string
      extract?: string
      title?: string
    }
    if (json.type === 'disambiguation') return {}
    if (!json.thumbnail?.source) return {}
    return {
      url: json.thumbnail.source,
      caption: json.description ?? json.title,
    }
  } catch {
    return {}
  }
}
