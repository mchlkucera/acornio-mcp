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
3. Add environment variables:
   - `GITHUB_TOKEN` (optional, for higher API rate limits)
   - `MCP_AUTH_TOKEN` (optional, for securing access to your MCP server)
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

## Security & Authentication

This MCP server supports optional token-based authentication to secure access to your knowledge bases.

### How It Works

- When `MCP_AUTH_TOKEN` is not set, the server accepts all requests (useful for local development or private networks)
- When `MCP_AUTH_TOKEN` is set, clients must provide this token in the `Authorization` header
- The server accepts both `Bearer <token>` and `<token>` formats

### Setting Up Authentication

1. Generate a secure random token (e.g., `openssl rand -hex 32`)
2. Set the `MCP_AUTH_TOKEN` environment variable on your hosting platform
3. Configure your MCP client with the same token (see examples below)

### Best Practices

- Use a strong, randomly-generated token (at least 32 characters)
- Keep your token secret and never commit it to version control
- Rotate your token periodically
- Use HTTPS for all production deployments to protect the token in transit

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub personal access token for higher API rate limits (60/hr → 5000/hr) | No |
| `MCP_AUTH_TOKEN` | Authentication token for securing MCP server access. When set, clients must provide this token in the Authorization header. | No |

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

If you've configured `MCP_AUTH_TOKEN`, add authentication:

```json
{
  "mcpServers": {
    "acornio-knowledge": {
      "url": "https://your-app.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer your_token_here"
      }
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

With authentication:

```json
{
  "mcpServers": {
    "acornio-knowledge": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "--header", "Authorization: Bearer your_token_here", "https://your-app.example.com/api/mcp"]
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
