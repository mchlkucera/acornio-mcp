import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const GITHUB_API_VERSION = 'application/vnd.github.v3+json';
const USER_AGENT = 'MCP-Knowledge-Server';
const MARKDOWN_EXTENSION = '.md';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

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
const KNOWLEDGE_BASE_IDS = KNOWLEDGE_BASES.map(kb => kb.id) as unknown as [KnowledgeBaseId, ...KnowledgeBaseId[]];

// Create a lookup map for O(1) access instead of O(n) find() calls
const KNOWLEDGE_BASE_MAP = new Map<KnowledgeBaseId, typeof KNOWLEDGE_BASES[number]>(
  KNOWLEDGE_BASES.map(kb => [kb.id, kb])
);

interface Document {
  name: string;
  title: string;
  description: string;
  path: string;
  knowledgeBase: KnowledgeBaseId;
}

// ═══════════════════════════════════════════════════════════════════════════
// GITHUB API TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formats a slug string into a title case string.
 * @example formatTitle('hello-world') => 'Hello World'
 */
function formatTitle(slug: string): string {
  return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Normalizes a path by removing leading './' and trailing slashes.
 * @param path - The path to normalize
 * @returns The normalized path without leading './' or trailing '/'
 */
function normalizePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\/$/, '');
}

/**
 * Creates GitHub API headers with optional authentication.
 */
function createGitHubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: GITHUB_API_VERSION,
    'User-Agent': USER_AGENT,
  };
  
  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }
  
  return headers;
}

/**
 * Validates the authentication token from the request.
 * @param request - The incoming HTTP request
 * @returns true if authentication is valid or not required, false otherwise
 */
function validateAuth(request: Request): boolean {
  // If no MCP_AUTH_TOKEN is configured, allow all requests
  if (!MCP_AUTH_TOKEN) {
    return true;
  }
  
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return false;
  }
  
  // Support both "Bearer <token>" and just "<token>" formats
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;
  
  return token === MCP_AUTH_TOKEN;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT FETCHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetches all markdown documents from a GitHub repository for a given knowledge base.
 * @param knowledgeBase - The knowledge base configuration
 * @returns Array of documents found in the repository
 */
async function fetchDocumentsFromRepo(knowledgeBase: typeof KNOWLEDGE_BASES[number]): Promise<Document[]> {
  const headers = createGitHubHeaders();
  const treeUrl = `${GITHUB_API_BASE}/repos/${knowledgeBase.owner}/${knowledgeBase.repo}/git/trees/${knowledgeBase.branch}?recursive=1`;

  try {
    const response = await fetch(treeUrl, { headers });
    
    if (!response.ok) {
      console.error(`Failed to fetch documents from ${knowledgeBase.id}: ${response.status} ${response.statusText}`);
      return [];
    }

    const tree = await response.json() as GitHubTreeResponse;
    const scopePath = normalizePath(knowledgeBase.path || './');
    
    return tree.tree
      .filter((item): item is GitHubTreeItem => {
        if (item.type !== 'blob' || !item.path.endsWith(MARKDOWN_EXTENSION)) {
          return false;
        }
        if (!scopePath) return true;
        return item.path.startsWith(`${scopePath}/`);
      })
      .map((item) => {
        const relativePath = scopePath ? item.path.slice(scopePath.length + 1) : item.path;
        const name = relativePath.replace(MARKDOWN_EXTENSION, '');
        const fileNameParts = relativePath.split('/');
        const fileName = fileNameParts[fileNameParts.length - 1]?.replace(MARKDOWN_EXTENSION, '') ?? name;
        
        return {
          name,
          title: formatTitle(fileName),
          description: `${knowledgeBase.name}: ${formatTitle(fileName)}`,
          path: item.path,
          knowledgeBase: knowledgeBase.id,
        };
      });
  } catch (error) {
    console.error(`Error fetching documents from ${knowledgeBase.id}:`, error);
    return [];
  }
}

async function fetchAllDocuments(): Promise<Document[]> {
  const results = await Promise.all(KNOWLEDGE_BASES.map(kb => fetchDocumentsFromRepo(kb)));
  return results.flat();
}

/**
 * Gets documents from a specific knowledge base or all knowledge bases.
 * @param knowledgeBaseId - Optional knowledge base ID to filter by
 * @returns Array of documents
 */
async function getDocuments(knowledgeBaseId?: KnowledgeBaseId): Promise<Document[]> {
  if (knowledgeBaseId) {
    const kb = KNOWLEDGE_BASE_MAP.get(knowledgeBaseId);
    if (!kb) {
      console.warn(`Unknown knowledge base ID: ${knowledgeBaseId}`);
      return [];
    }
    return fetchDocumentsFromRepo(kb);
  }
  return fetchAllDocuments();
}

/**
 * Fetches the raw content of a specific document from a knowledge base.
 * @param knowledgeBaseId - The knowledge base ID
 * @param documentName - The document name (without .md extension)
 * @returns The document content as a string
 * @throws Error if the knowledge base is unknown or document is not found
 */
async function fetchDocumentContent(knowledgeBaseId: KnowledgeBaseId, documentName: string): Promise<string> {
  const kb = KNOWLEDGE_BASE_MAP.get(knowledgeBaseId);
  if (!kb) {
    throw new Error(`Unknown knowledge base: ${knowledgeBaseId}`);
  }
  
  const scopePath = normalizePath(kb.path || './');
  const fullPath = scopePath ? `${scopePath}/${documentName}${MARKDOWN_EXTENSION}` : `${documentName}${MARKDOWN_EXTENSION}`;
  const url = `${GITHUB_RAW_BASE}/${kb.owner}/${kb.repo}/${kb.branch}/${fullPath}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Document not found: ${documentName} (${response.status} ${response.statusText})`);
    }
    return response.text();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch document: ${documentName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP SERVER SETUP (Stateless - works on Railway/Vercel/anywhere)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates and configures the MCP server with all tools.
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: 'acornio-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'searchDocuments',
    {
      description: 'Search for documents by name across all knowledge bases',
      inputSchema: { 
        query: z.string().describe('Search query'),
        knowledgeBase: z.enum(KNOWLEDGE_BASE_IDS).optional().describe('Limit to specific knowledge base'),
      },
    },
    async ({ query, knowledgeBase }) => {
      const documents = await getDocuments(knowledgeBase);
      const queryLower = query.toLowerCase();
      const matches = documents.filter(doc => 
        doc.name.toLowerCase().includes(queryLower) || doc.title.toLowerCase().includes(queryLower)
      );
      
      const resultText = matches.length > 0
        ? `Found ${matches.length} document(s):\n${matches.map(d => `- ${d.title} (${d.knowledgeBase}/${d.name})`).join('\n')}`
        : 'No documents found.';
      
      return {
        content: [{
          type: 'text',
          text: resultText,
        }],
      };
    },
  );

  server.registerTool(
    'getDocument',
    {
      description: 'Get the full content of a document',
      inputSchema: {
        knowledgeBase: z.enum(KNOWLEDGE_BASE_IDS).describe('Knowledge base ID'),
        documentName: z.string().describe('Document name (without .md)'),
      },
    },
    async ({ knowledgeBase, documentName }) => {
      try {
        const content = await fetchDocumentContent(knowledgeBase, documentName);
        return { content: [{ type: 'text', text: content }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`Error fetching document ${documentName} from ${knowledgeBase}:`, error);
        return { 
          content: [{ type: 'text', text: `Error: ${errorMessage}` }], 
          isError: true 
        };
      }
    },
  );

  server.registerTool(
    'listKnowledgeBases',
    {
      description: 'List all knowledge bases and their document counts',
      inputSchema: {},
    },
    async () => {
      const results = await Promise.all(
        KNOWLEDGE_BASES.map(async (kb) => {
          const docs = await getDocuments(kb.id);
          return `📚 ${kb.name} (${kb.id}) - ${docs.length} documents`;
        })
      );
      return { content: [{ type: 'text', text: results.join('\n') }] };
    },
  );

  server.registerTool(
    'listDocuments',
    {
      description: 'List all documents in a knowledge base',
      inputSchema: { knowledgeBase: z.enum(KNOWLEDGE_BASE_IDS).optional() },
    },
    async ({ knowledgeBase }) => {
      const documents = await getDocuments(knowledgeBase as KnowledgeBaseId | undefined);
      if (documents.length === 0) return { content: [{ type: 'text', text: 'No documents found.' }] };
      
      const grouped = documents.reduce((acc, doc) => {
        if (!acc[doc.knowledgeBase]) acc[doc.knowledgeBase] = [];
        acc[doc.knowledgeBase].push(doc);
        return acc;
      }, {} as Record<string, Document[]>);

      const output = Object.entries(grouped)
        .map(([kbId, docs]) => {
          const kb = KNOWLEDGE_BASE_MAP.get(kbId as KnowledgeBaseId);
          return `📚 ${kb?.name || kbId}:\n${docs.map(d => `   - ${d.title} (${d.name})`).join('\n')}`;
        })
        .join('\n\n');

      return { content: [{ type: 'text', text: output }] };
    },
  );

  return server;
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP HANDLERS - Stateless mode (no session management needed)
// ═══════════════════════════════════════════════════════════════════════════

// Create a single stateless transport and server
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless mode
});
const server = createServer();
let isConnected = false;

/**
 * Ensures the server is connected to the transport.
 * This is safe to call multiple times as it only connects once.
 */
async function ensureConnected(): Promise<void> {
  if (!isConnected) {
    await server.connect(transport);
    isConnected = true;
    console.log('🚀 MCP Knowledge Server connected');
  }
}

export async function POST(request: Request) {
  // Validate authentication
  if (!validateAuth(request)) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: { 
        code: -32001, 
        message: 'Unauthorized: Invalid or missing authentication token' 
      },
      id: null,
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  await ensureConnected();
  const { req, res } = toReqRes(request);
  await transport.handleRequest(req, res);
  return toFetchResponse(res);
}

export async function GET() {
  // SSE streams not supported in stateless mode - return 405
  // Cursor will still work, it just won't get server-initiated notifications
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'SSE not supported in stateless mode' },
    id: null,
  }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version',
    },
  });
}
