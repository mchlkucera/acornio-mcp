# Acornio MCP Server

A Model Context Protocol (MCP) server that provides access to knowledge base documents from GitHub repositories.

## Features

- **4 Tools**: `listKnowledgeBases`, `listDocuments`, `searchDocuments`, `getDocument`
- **Multiple Knowledge Bases**: Supports multiple GitHub repositories as knowledge sources
- **Auto-discovery**: Automatically discovers markdown documents in configured repositories
- **Stateless**: Works on any hosting platform (Railway, Vercel, etc.)

## Deployment

This is a Next.js application that can be deployed to any platform that supports Next.js.

### Quick Deploy Options

- **Vercel**: Connect your GitHub repo and deploy with one click
- **Railway**: Connect your repo and Railway auto-detects Next.js
- **Netlify**: Connect your repo and configure build command: `npm run build`
- **Fly.io**: Use the Next.js template
- **Any Node.js host**: Run `npm run build && npm start`

### Deployment Steps

1. Push your code to GitHub
2. Connect your repository to your chosen hosting platform
3. Add environment variable: `GITHUB_TOKEN` (optional, for higher API rate limits)
4. Deploy! The platform should auto-detect Next.js and configure accordingly

### Platform-Specific Notes

- **Vercel**: Zero configuration needed, just connect and deploy
- **Railway**: Auto-detects Next.js, no additional config required
- **Netlify**: May need to set build command: `npm run build` and publish directory: `.next`
- **Self-hosted**: Ensure Node.js 18+ is installed and set `NODE_ENV=production`

## Configuration

Edit `app/api/[transport]/route.ts` to configure your knowledge bases:

```typescript
const KNOWLEDGE_BASES = [
  {
    id: 'vision',
    name: 'My Knowledge Base',
    description: 'Description of knowledge base',
    owner: 'github-username',
    repo: 'repo-name',
    branch: 'main',
    path: './docs', // path to markdown files
  },
  // Add more...
];
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub personal access token for higher API rate limits (60/hr → 5000/hr) | No |

## Connect to MCP Client

### Cursor / Claude Desktop

Add to your MCP config (replace `https://your-app.example.com` with your deployed URL):

```json
{
  "mcpServers": {
    "acornio-knowledge": {
      "url": "https://your-app.example.com/api/mcp"
    }
  }
}
```

Or use mcp-remote for stdio transport:

```json
{
  "mcpServers": {
    "acornio-knowledge": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-app.example.com/api/mcp"]
    }
  }
}
```

**Note**: Replace `your-app.example.com` with your actual deployment URL:
- Vercel: `your-app.vercel.app`
- Railway: `your-app.railway.app`
- Netlify: `your-app.netlify.app`
- Custom domain: `your-domain.com`

## Local Development

```bash
npm install
npm run dev
```

Server runs at `http://localhost:3000/api/mcp`

## Available Tools

### `listKnowledgeBases`
Lists all configured knowledge bases and their document counts.

### `listDocuments`
Lists all documents, optionally filtered by knowledge base.

### `searchDocuments`
Searches for documents by name/title across knowledge bases.

### `getDocument`
Retrieves the full content of a specific document.

## License

MIT
