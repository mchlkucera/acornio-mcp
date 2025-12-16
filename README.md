# Random Knowledge MCP

An MCP (Model Context Protocol) server deployed on Vercel that provides tools for exploring a knowledge base.

## Features

- **sayHello** - A friendly greeting from the MCP server
- **listMesopotamiaDocuments** - List all markdown documents in the knowledge base
- **readMesopotamiaDocument** - Read specific documents
- **searchMesopotamiaDocuments** - Search across all documents for topics, people, places, or events
- **openMesopotamiaMap** - Get the URL for an interactive map

## Setup

### 1. Configure the Knowledge Base

Update the repository configuration in `app/api/mcp/route.ts`:

```typescript
const MESOPOTAMIA_REPO = 'your-username/random-knowledge-base';
const MESOPOTAMIA_BRANCH = 'main';
```

Replace with your actual GitHub repository containing markdown documents.

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Locally

```bash
npm run dev
```

The server will start at `http://localhost:3000`.

### 4. Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest http://localhost:3000
```

Then:
1. Open http://127.0.0.1:6274
2. Select "Streamable HTTP" transport
3. Enter URL: `http://localhost:3000/api/mcp`
4. Click Connect
5. Test the tools under "List Tools"

## Deploy to Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/random-knowledge-mcp)

### Manual Deploy

1. Push this repository to GitHub
2. Import the project in Vercel Dashboard
3. Deploy!

Your MCP server will be available at `https://your-project.vercel.app/api/mcp`

## Configure MCP Clients

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "random-knowledge": {
      "url": "https://your-project.vercel.app/api/mcp"
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "random-knowledge": {
      "transport": {
        "type": "streamable-http",
        "url": "https://your-project.vercel.app/api/mcp"
      }
    }
  }
}
```

## Knowledge Base Format

The knowledge base should be a GitHub repository with markdown files. Each `.md` file represents a document that can be listed, read, and searched.

## Tech Stack

- **Framework**: Next.js 15
- **MCP Handler**: mcp-handler
- **Validation**: Zod
- **Deployment**: Vercel
- **Transport**: Streamable HTTP

## License

MIT
