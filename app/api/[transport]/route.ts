import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

// Store transports and servers by session ID for stateful connections
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();
const servers = new Map<string, McpServer>();

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// GitHub token for higher API rate limits (60/hr → 5000/hr)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Knowledge base repositories
const KNOWLEDGE_BASES = [
  {
    id: 'vision',
    name: 'Acornio Vision',
    description: 'Vision documents for Acornio',
    owner: 'mchlkucera',
    repo: 'acornio',
    branch: 'main',
    path: './vision',
  },
  {
    id: 'technical-state',
    name: 'Acornio Technical State',
    description: 'Technical state documents for Acornio',
    owner: 'mchlkucera',
    repo: 'acornio',
    branch: 'main',
    path: './technical-state',
  },
  {
    id: 'processes',
    name: 'Acornio Processes',
    description: 'Process documents for Acornio',
    owner: 'mchlkucera',
    repo: 'acornio',
    branch: 'main',
    path: './processes',
  },
] as const;

type KnowledgeBaseId = typeof KNOWLEDGE_BASES[number]['id'];

// Derived array for use with z.enum() - automatically stays in sync with KNOWLEDGE_BASES
const KNOWLEDGE_BASE_IDS = KNOWLEDGE_BASES.map(kb => kb.id) as unknown as [KnowledgeBaseId, ...KnowledgeBaseId[]];

interface Document {
  name: string;
  title: string;
  description: string;
  path: string;
  knowledgeBase: KnowledgeBaseId;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT CACHE & DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry {
  documents: Document[];
  timestamp: number;
}

const documentCache = new Map<KnowledgeBaseId, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let isInitialized = false;

// Convert "merchant-enlil-bani" → "Merchant Enlil Bani"
function formatTitle(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Fetch document list from GitHub API for a single repository (supports nested directories)
async function fetchDocumentsFromRepo(knowledgeBase: typeof KNOWLEDGE_BASES[number]): Promise<Document[]> {
  const cached = documentCache.get(knowledgeBase.id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.documents;
  }

  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'MCP-Knowledge-Server',
  };
  
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }

  try {
    // Use Git Trees API with recursive=1 to get ALL files in the repo/directory
    const treeUrl = `https://api.github.com/repos/${knowledgeBase.owner}/${knowledgeBase.repo}/git/trees/${knowledgeBase.branch}?recursive=1`;
    const response = await fetch(treeUrl, { headers });
    
    if (!response.ok) {
      console.error(`GitHub API error for ${knowledgeBase.repo}: ${response.status}`);
      // Return cached even if stale
      if (cached) return cached.documents;
      return [];
    }

    const tree = await response.json();
    
    // Normalize the path scope (handle ./ for root, remove leading ./ and trailing /)
    const rawPath = (knowledgeBase.path || './').replace(/^\.\//, '').replace(/\/$/, '');
    const scopePath = rawPath; // Empty string means root
    
    const documents: Document[] = tree.tree
      .filter((f: any) => {
        // Must be a file (blob) and end with .md
        if (f.type !== 'blob' || !f.path.endsWith('.md')) return false;
        
        // If no scope path, include all markdown files
        if (!scopePath) return true;
        
        // Must be within the scoped directory
        return f.path.startsWith(scopePath + '/');
      })
      .map((f: any) => {
        // Get the relative path within the scope (or full path if no scope)
        const relativePath = scopePath 
          ? f.path.slice(scopePath.length + 1) // +1 for the trailing slash
          : f.path;
        
        // Document name is the path without .md extension (preserves nested structure)
        const name = relativePath.replace('.md', '');
        
        // Title is derived from the filename (last part of path)
        const fileName = relativePath.split('/').pop()!.replace('.md', '');
        
        return {
          name,
          title: formatTitle(fileName),
          description: `${knowledgeBase.name}: ${formatTitle(fileName)}`,
          path: f.path, // Full path in repo for fetching content
          knowledgeBase: knowledgeBase.id,
        };
      });

    documentCache.set(knowledgeBase.id, {
      documents,
      timestamp: Date.now(),
    });

    return documents;
  } catch (error) {
    console.error(`Failed to fetch from ${knowledgeBase.repo}:`, error);
    if (cached) return cached.documents;
    return [];
  }
}

// Fetch documents from all repositories
async function fetchAllDocuments(): Promise<Document[]> {
  const results = await Promise.all(
    KNOWLEDGE_BASES.map(kb => fetchDocumentsFromRepo(kb))
  );
  return results.flat();
}

// Get documents for a specific knowledge base
async function getDocuments(knowledgeBaseId?: KnowledgeBaseId): Promise<Document[]> {
  if (knowledgeBaseId) {
    const kb = KNOWLEDGE_BASES.find(k => k.id === knowledgeBaseId);
    if (!kb) return [];
    return fetchDocumentsFromRepo(kb);
  }
  return fetchAllDocuments();
}

// Fetch actual document content from GitHub raw URLs (no rate limit!)
async function fetchDocumentContent(knowledgeBaseId: KnowledgeBaseId, documentName: string): Promise<string> {
  const kb = KNOWLEDGE_BASES.find(k => k.id === knowledgeBaseId);
  if (!kb) throw new Error(`Unknown knowledge base: ${knowledgeBaseId}`);
  
  // Construct the full path: scope path + document name + .md extension
  // Handle ./ for root, remove leading ./ and trailing /
  const scopePath = (kb.path || './').replace(/^\.\//, '').replace(/\/$/, '');
  const fullPath = scopePath 
    ? `${scopePath}/${documentName}.md`
    : `${documentName}.md`;
  
  const url = `https://raw.githubusercontent.com/${kb.owner}/${kb.repo}/${kb.branch}/${fullPath}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Document not found: ${documentName} in ${kb.repo}`);
  }
  
  return response.text();
}

// Initialize: Scan all repositories on startup
async function initializeKnowledgeBase(): Promise<void> {
  if (isInitialized) return;
  
  console.log('🔍 Initializing MCP Knowledge Server...');
  console.log(`📚 Scanning ${KNOWLEDGE_BASES.length} knowledge base repositories...`);
  
  const startTime = Date.now();
  const allDocs = await fetchAllDocuments();
  
  console.log(`✅ Found ${allDocs.length} documents across all repositories in ${Date.now() - startTime}ms`);
  
  for (const kb of KNOWLEDGE_BASES) {
    const docs = documentCache.get(kb.id);
    console.log(`   - ${kb.name}: ${docs?.documents.length ?? 0} documents`);
  }
  
  isInitialized = true;
}

// Create a new MCP server instance
async function createServer() {
  // Initialize knowledge base on server creation (scan GitHub repos)
  await initializeKnowledgeBase();
  
  const server = new McpServer({
    name: 'knowledge-base-mcp',
    version: '1.0.0',
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCES: Knowledge Base Discovery
  // ═══════════════════════════════════════════════════════════════════════════

  // Resource: List all knowledge bases
  server.registerResource(
    'knowledge-bases',
    'kb://sources',
    {
      description: 'List of all available knowledge base sources (GitHub repositories)',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [{
        uri: 'kb://sources',
        mimeType: 'application/json',
        text: JSON.stringify(KNOWLEDGE_BASES.map(kb => ({
          id: kb.id,
          name: kb.name,
          description: kb.description,
          repository: `${kb.owner}/${kb.repo}`,
        })), null, 2),
      }],
    }),
  );

  // Resource: List ALL documents from all knowledge bases
  server.registerResource(
    'all-documents',
    'kb://documents',
    {
      description: 'List of all documents across all knowledge bases (auto-discovered from GitHub)',
      mimeType: 'application/json',
    },
    async () => {
      const documents = await fetchAllDocuments();
      return {
        contents: [{
          uri: 'kb://documents',
          mimeType: 'application/json',
          text: JSON.stringify(documents, null, 2),
        }],
      };
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCES: Per-Knowledge-Base Documents
  // ═══════════════════════════════════════════════════════════════════════════

  // Register resources for each knowledge base
  for (const kb of KNOWLEDGE_BASES) {
    // Resource: List documents in this knowledge base
    server.registerResource(
      `${kb.id}-documents`,
      `kb://${kb.id}/documents`,
      {
        description: `List of documents in ${kb.name} (auto-discovered from GitHub)`,
        mimeType: 'application/json',
      },
      async () => {
        const documents = await getDocuments(kb.id);
        return {
          contents: [{
            uri: `kb://${kb.id}/documents`,
            mimeType: 'application/json',
            text: JSON.stringify(documents, null, 2),
          }],
        };
      },
    );

    // Resource Template: Read individual documents from this knowledge base
    server.registerResource(
      `${kb.id}-document`,
      new ResourceTemplate(`kb://${kb.id}/documents/{documentName}`, {
        list: async () => {
          const documents = await getDocuments(kb.id);
          return {
            resources: documents.map((doc) => ({
              uri: `kb://${kb.id}/documents/${doc.name}`,
              name: doc.title,
              description: doc.description,
              mimeType: 'text/markdown',
            })),
          };
        },
        complete: {
          documentName: async () => {
            const documents = await getDocuments(kb.id);
            return documents.map((d) => d.name);
          },
        },
      }),
      {
        description: `Individual document from ${kb.name}`,
        mimeType: 'text/markdown',
      },
      async (uri, { documentName }) => {
        const content = await fetchDocumentContent(kb.id, documentName as string);
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/markdown',
            text: content,
          }],
        };
      },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLS: Knowledge Base Operations
  // ═══════════════════════════════════════════════════════════════════════════

  // Tool: Search across all documents
  server.registerTool(
    'searchDocuments',
    {
      description: 'Search for documents by name across all knowledge bases. Returns matching document metadata.',
      inputSchema: {
        query: z.string().describe('Search query to match against document names'),
        knowledgeBase: z.enum(KNOWLEDGE_BASE_IDS).optional().describe('Optional: limit search to specific knowledge base'),
      },
    },
    async ({ query, knowledgeBase }) => {
      const documents = await getDocuments(knowledgeBase as KnowledgeBaseId | undefined);
      const q = (query as string).toLowerCase();
      
      const matches = documents.filter(doc => 
        doc.name.toLowerCase().includes(q) || 
        doc.title.toLowerCase().includes(q)
      );

      return {
        content: [{
          type: 'text',
          text: matches.length > 0
            ? `Found ${matches.length} document(s):\n${matches.map(d => `- ${d.title} (${d.knowledgeBase}/${d.name})`).join('\n')}`
            : 'No documents found matching your query.',
        }],
      };
    },
  );

  // Tool: Get document content
  server.registerTool(
    'getDocument',
    {
      description: 'Retrieve the full content of a specific document from a knowledge base.',
      inputSchema: {
        knowledgeBase: z.enum(KNOWLEDGE_BASE_IDS).describe('The knowledge base to read from'),
        documentName: z.string().describe('The document name (without .md extension)'),
      },
    },
    async ({ knowledgeBase, documentName }) => {
      try {
        const content = await fetchDocumentContent(knowledgeBase as KnowledgeBaseId, documentName as string);
        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // Tool: List available knowledge bases
  server.registerTool(
    'listKnowledgeBases',
    {
      description: 'List all available knowledge base sources and their document counts.',
      inputSchema: {},
    },
    async () => {
      const results = await Promise.all(
        KNOWLEDGE_BASES.map(async (kb) => {
          const docs = await getDocuments(kb.id);
          return `📚 ${kb.name} (${kb.id})\n   Repository: ${kb.owner}/${kb.repo}\n   Documents: ${docs.length}`;
        })
      );

      return {
        content: [{
          type: 'text',
          text: `Available Knowledge Bases:\n\n${results.join('\n\n')}`,
        }],
      };
    },
  );

  // Tool: Refresh document cache
  server.registerTool(
    'refreshDocuments',
    {
      description: 'Force refresh the document cache by re-scanning GitHub repositories.',
      inputSchema: {},
    },
    async () => {
      documentCache.clear();
      isInitialized = false;
      
      const startTime = Date.now();
      await initializeKnowledgeBase();
      
      const allDocs = await fetchAllDocuments();
      
      return {
        content: [{
          type: 'text',
          text: `✅ Refreshed document cache in ${Date.now() - startTime}ms\nFound ${allDocs.length} documents across ${KNOWLEDGE_BASES.length} knowledge bases.`,
        }],
      };
    },
  );

  return server;
}

export async function POST(request: Request) {
  // Check for existing session
  const sessionId = request.headers.get('mcp-session-id');
  let transport: WebStandardStreamableHTTPServerTransport;
  let server: McpServer;

  if (sessionId && transports.has(sessionId) && servers.has(sessionId)) {
    // Reuse existing transport and server for this session
    transport = transports.get(sessionId)!;
    server = servers.get(sessionId)!;
    
    // In serverless environments, the server connection might be lost even if both exist in memory
    // Always reconnect to ensure the server is properly initialized
    // This is safe - connecting an already-connected server should be handled gracefully
    try {
      await server.connect(transport);
      // Handle the request with the reconnected server
      return await transport.handleRequest(request);
    } catch (error) {
      // If reconnection fails, create fresh transport/server
      console.log(`[${sessionId}] Failed to reconnect server, creating new connection:`, error);
      // Fall through to create new connection
    }
  }

  // Create new transport/server connection
  // This happens if:
  // 1. No existing session
  // 2. Transport or server not found (common in serverless after instance restart)
  // 3. Reconnection failed
  if (sessionId) {
    // Clean up old entries if they exist
    transports.delete(sessionId);
    servers.delete(sessionId);
  }

  // Create new transport for new session or reconnection
  // Use provided sessionId if available, otherwise let transport generate one
  let capturedSessionId: string | null = null;
  transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId || crypto.randomUUID(),
    onsessioninitialized: (id) => {
      capturedSessionId = id;
      transports.set(id, transport);
    },
  });

  // Create and connect the MCP server to the transport
  server = await createServer();
  await server.connect(transport);
  
  // Store server for this session
  // Use the captured session ID from callback, or fall back to provided sessionId
  const finalSessionId = capturedSessionId || sessionId;
  if (finalSessionId) {
    servers.set(finalSessionId, server);
    // Also ensure transport is stored with this ID
    if (!transports.has(finalSessionId)) {
      transports.set(finalSessionId, transport);
    }
  }

  // Handle the request with the new transport
  return transport.handleRequest(request);
}

export async function GET(request: Request) {
  const sessionId = request.headers.get('mcp-session-id');

  if (!sessionId || !transports.has(sessionId) || !servers.has(sessionId)) {
    return new Response('Session not found', { status: 404 });
  }

  const transport = transports.get(sessionId)!;
  const server = servers.get(sessionId)!;
  
  // Ensure server is connected
  try {
    return await transport.handleRequest(request);
  } catch (error) {
    // If connection is lost, return error
    console.error(`[${sessionId}] GET request failed:`, error);
    return new Response('Session connection lost', { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const sessionId = request.headers.get('mcp-session-id');

  if (sessionId) {
    if (transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      try {
        await transport.close();
      } catch (error) {
        console.error(`[${sessionId}] Error closing transport:`, error);
      }
      transports.delete(sessionId);
    }
    if (servers.has(sessionId)) {
      servers.delete(sessionId);
    }
  }

  return new Response(null, { status: 204 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, mcp-protocol-version',
    },
  });
}
