import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { connectSidecar } from '@coop-tech/mcp-sidecar'

// arXiv requires at least 3 seconds between requests
// https://info.arxiv.org/help/api/tou.html
const MIN_REQUEST_INTERVAL_MS = 3_000

let nextRequestAt = 0

async function fetchArxiv(url: string): Promise<string> {
  const now = Date.now()
  const delay = Math.max(0, nextRequestAt - now)
  nextRequestAt = Math.max(now, nextRequestAt) + MIN_REQUEST_INTERVAL_MS
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status}: ${res.statusText}`)
  }
  return res.text()
}

const server = new McpServer({ name: 'arxiv', version: '1.0.0' })

server.tool(
  'arxiv_search',
  'Search arXiv papers. Supports boolean operators (AND, OR, ANDNOT) and field prefixes (ti:, au:, abs:, cat:, co:, jr:, rn:, all:).',
  {
    query: z.string().describe('Search query, e.g. "ti:transformer AND cat:cs.CL ANDNOT au:smith"'),
    submitted_date_from: z.string().optional().describe('Start date in YYYYMMDDHHMM format (GMT)'),
    submitted_date_to: z.string().optional().describe('End date in YYYYMMDDHHMM format (GMT)'),
    start: z.number().int().min(0).default(0).describe('Index of first result'),
    max_results: z.number().int().min(1).max(100).default(10).describe('Number of results'),
    sort_by: z.enum(['relevance', 'lastUpdatedDate', 'submittedDate']).default('relevance').describe('Sort field'),
    sort_order: z.enum(['ascending', 'descending']).default('descending').describe('Sort order'),
  },
  async ({ query, submitted_date_from, submitted_date_to, start, max_results, sort_by, sort_order }) => {
    let search_query = query
    if (submitted_date_from || submitted_date_to) {
      const from = submitted_date_from ?? '199101010000'
      const to = submitted_date_to ?? '205012312359'
      search_query = `(${search_query}) AND submittedDate:[${from} TO ${to}]`
    }

    const params = new URLSearchParams({
      search_query,
      start: String(start),
      max_results: String(max_results),
      sortBy: sort_by,
      sortOrder: sort_order,
    })

    const xml = await fetchArxiv(`http://export.arxiv.org/api/query?${params}`)
    return { content: [{ type: 'text', text: xml }] }
  },
)

server.tool(
  'arxiv_fetch',
  'Fetch a single arXiv paper by its ID',
  {
    id: z.string().describe('arXiv paper ID (e.g. "2301.07041" or "cond-mat/0207270v1")'),
  },
  async ({ id }) => {
    const params = new URLSearchParams({ id_list: id })
    const xml = await fetchArxiv(`http://export.arxiv.org/api/query?${params}`)
    return { content: [{ type: 'text', text: xml }] }
  },
)

// --- Connect to coop.tech ---

await connectSidecar({
  server,
  token: process.env.COOP_TECH_TOKEN!,
  description: 'Search and fetch papers from the arXiv API',
})
