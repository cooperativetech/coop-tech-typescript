# mcp-sidecar examples

## arXiv

A tool server that wraps the [arXiv API](https://info.arxiv.org/help/api/index.html), providing two tools:

- **`arxiv_search`** — search papers with field-specific filters (title, author, abstract, category, journal ref, comment, report number), sorting, ID list filtering, and raw query support with boolean operators
- **`arxiv_fetch`** — fetch a single paper by its arXiv ID

### Running

Run these commands from the `packages/mcp-sidecar` directory:

```bash
# Build the package
pnpm build

# Set your coop.tech token
export COOP_TECH_TOKEN="your-token-here"

# Run the example
npx tsx examples/arxiv.ts
```

The server will connect to coop.tech and stay running, ready to handle tool calls.
