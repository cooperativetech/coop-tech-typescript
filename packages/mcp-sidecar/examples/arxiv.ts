import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { connectSidecar } from '@coop-tech/mcp-sidecar'
import { buildArxivSearchUrl } from './arxiv-query.ts'

const MIN_REQUEST_INTERVAL_MS = 3_000
const RATE_LIMIT_DELAY_MS = 10_000
const MAX_CONSECUTIVE_RATE_LIMITS = 3

let nextRequestAt = 0
let consecutiveRateLimits = 0

async function fetchArxiv(url: string): Promise<string> {
  const now = Date.now()
  const delay = Math.max(0, nextRequestAt - now)
  nextRequestAt = Math.max(now, nextRequestAt) + MIN_REQUEST_INTERVAL_MS
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  const res = await fetch(url)

  if (res.status === 429) {
    consecutiveRateLimits++
    if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) {
      console.error(`[arxiv] Rate limited ${consecutiveRateLimits} times in a row, terminating`)
      process.exit(1)
    }
    nextRequestAt = Math.max(nextRequestAt, Date.now() + RATE_LIMIT_DELAY_MS)
    console.log(`[arxiv] Rate limited (${consecutiveRateLimits}/${MAX_CONSECUTIVE_RATE_LIMITS}), retrying in ${RATE_LIMIT_DELAY_MS / 1000}s...`)
    return fetchArxiv(url)
  }

  consecutiveRateLimits = 0

  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status}: ${res.statusText}`)
  }
  return res.text()
}

const server = new McpServer({ name: 'arxiv', version: '1.0.0' })

server.tool(
  'arxiv_search',
  'Search arXiv papers. Use field-specific params for structured queries, or `query` for raw search strings with boolean operators (AND, OR, ANDNOT) and field prefixes (ti:, au:, abs:, cat:, co:, jr:, rn:, all:). All provided params are joined with AND.',
  {
    query: z
      .string()
      .optional()
      .describe(
        'Raw search query. Supports boolean operators (AND, OR, ANDNOT), field prefixes (ti:, au:, abs:, cat:, co:, jr:, rn:, all:), and grouping with parentheses. e.g. "ti:transformer AND cat:cs.CL ANDNOT au:smith"',
      ),
    title: z.string().optional().describe('Search within paper titles'),
    author: z.string().optional().describe('Search by author name'),
    abstract: z.string().optional().describe('Search within abstracts'),
    category: z
      .string()
      .optional()
      .describe('Filter by arXiv subject category (e.g. "cs.AI", "hep-th", "cond-mat.str-el")'),
    journal_ref: z.string().optional().describe('Search by journal reference'),
    comment: z.string().optional().describe('Search within paper comments'),
    report_number: z.string().optional().describe('Search by report number'),
    submitted_date_from: z
      .string()
      .optional()
      .describe('Start of submission date range in YYYYMMDDHHMM format (GMT), e.g. "202301010000"'),
    submitted_date_to: z
      .string()
      .optional()
      .describe('End of submission date range in YYYYMMDDHHMM format (GMT), e.g. "202312312359"'),
    id_list: z
      .array(z.string())
      .optional()
      .describe(
        'List of arXiv IDs to search within. When combined with other search params, only returns matching papers from this list.',
      ),
    start: z.number().int().min(0).default(0).describe('Index of first result'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .describe('Number of results to return'),
    sort_by: z
      .enum(['relevance', 'lastUpdatedDate', 'submittedDate'])
      .default('relevance')
      .describe('Sort results by relevance, last updated date, or submission date'),
    sort_order: z
      .enum(['ascending', 'descending'])
      .default('descending')
      .describe('Sort order'),
  },
  async ({
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
  }) => {
    const url = buildArxivSearchUrl({
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
    })

    if (!url) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Provide at least one search parameter or an id_list.',
          },
        ],
        isError: true,
      }
    }

    const xml = await fetchArxiv(url)
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
