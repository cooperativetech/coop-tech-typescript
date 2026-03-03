export interface ArxivSearchFields {
  query?: string
  title?: string
  author?: string
  abstract?: string
  category?: string
  journal_ref?: string
  comment?: string
  report_number?: string
  submitted_date_from?: string
  submitted_date_to?: string
  id_list?: string[]
  start: number
  max_results: number
  sort_by: 'relevance' | 'lastUpdatedDate' | 'submittedDate'
  sort_order: 'ascending' | 'descending'
}

export function buildArxivSearchUrl(fields: ArxivSearchFields): string | null {
  const {
    query,
    title,
    author,
    abstract,
    category,
    journal_ref,
    comment,
    report_number,
    submitted_date_from,
    submitted_date_to,
    id_list,
    start,
    max_results,
    sort_by,
    sort_order,
  } = fields

  const parts: string[] = []
  if (title) parts.push(`ti:${title}`)
  if (author) parts.push(`au:${author}`)
  if (abstract) parts.push(`abs:${abstract}`)
  if (category) parts.push(`cat:${category}`)
  if (journal_ref) parts.push(`jr:${journal_ref}`)
  if (comment) parts.push(`co:${comment}`)
  if (report_number) parts.push(`rn:${report_number}`)
  if (submitted_date_from || submitted_date_to) {
    const from = submitted_date_from ?? '199101010000'
    const to = submitted_date_to ?? '205012312359'
    parts.push(`submittedDate:[${from} TO ${to}]`)
  }

  let search_query = parts.join(' AND ')
  if (query) {
    search_query = search_query ? `(${search_query}) AND (${query})` : query
  }

  if (!search_query && !id_list?.length) return null

  const params = new URLSearchParams({
    start: String(start),
    max_results: String(max_results),
    sortBy: sort_by,
    sortOrder: sort_order,
  })
  if (search_query) params.set('search_query', search_query)
  if (id_list?.length) params.set('id_list', id_list.join(','))

  return `http://export.arxiv.org/api/query?${params}`
}
