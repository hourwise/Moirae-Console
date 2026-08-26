import { requestInspectDocument } from '../inspection/client';
import { requestPublishDocument } from '../publication/client';
import { DEMO_DOCUMENT_ID, INSPECT_DOCUMENT_ACTION } from './inspect-document';
import { WEBMCP_TOOLS } from './tools';

export interface BrowserModelContextTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations?: Readonly<Record<string, unknown>>;
  execute(input: unknown, client?: unknown): Promise<unknown>;
}

export interface BrowserModelContext {
  registerTool(
    tool: BrowserModelContextTool,
    options?: { readonly signal?: AbortSignal },
  ): Promise<void> | void;
}

export type WebMcpRegistrationState = 'REGISTERED' | 'UNAVAILABLE' | 'FAILED';

export interface WebMcpRegistrationResult {
  readonly state: WebMcpRegistrationState;
  readonly toolNames: readonly string[];
  readonly reason?: string;
}

declare global {
  interface Document {
    readonly modelContext?: BrowserModelContext;
  }
}

let defaultRegistration: Promise<WebMcpRegistrationResult> | undefined;

/**
 * Registers the exact public WebMCP surface with the current browser API.
 * The legacy navigator surface is intentionally not used.
 */
export function registerWebMcpTools(
  modelContext?: BrowserModelContext,
): Promise<WebMcpRegistrationResult> {
  if (modelContext === undefined) {
    defaultRegistration ??= register(
      typeof document === 'undefined' ? undefined : document.modelContext,
    );
    return defaultRegistration;
  }
  return register(modelContext);
}

async function register(
  modelContext: BrowserModelContext | undefined,
): Promise<WebMcpRegistrationResult> {
  if (!modelContext?.registerTool) {
    return { state: 'UNAVAILABLE', toolNames: [] };
  }

  const controllers: AbortController[] = [];
  try {
    for (const descriptor of WEBMCP_TOOLS) {
      const controller = new AbortController();
      controllers.push(controller);
      await modelContext.registerTool(
        {
          name: descriptor.name,
          description: descriptor.description,
          inputSchema: descriptor.inputSchema,
          annotations: {
            readOnlyHint: descriptor.name === INSPECT_DOCUMENT_ACTION,
          },
          execute: async (input) => {
            assertFixedDocumentInput(input);
            const result =
              descriptor.name === INSPECT_DOCUMENT_ACTION
                ? await requestInspectDocument()
                : await requestPublishDocument();
            emitToolResult(descriptor.name, result);
            return result;
          },
        },
        { signal: controller.signal },
      );
    }

    const result = {
      state: 'REGISTERED' as const,
      toolNames: WEBMCP_TOOLS.map((tool) => tool.name),
    };
    emitRegistration(result);
    return result;
  } catch (error) {
    controllers.forEach((controller) => controller.abort());
    const result = {
      state: 'FAILED' as const,
      toolNames: [],
      reason: error instanceof Error ? error.message : 'WEBMCP_REGISTRATION_FAILED',
    };
    emitRegistration(result);
    return result;
  }
}

function assertFixedDocumentInput(value: unknown): asserts value is { documentId: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('WEBMCP_FIXED_DOCUMENT_INPUT_REQUIRED');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || record.documentId !== DEMO_DOCUMENT_ID) {
    throw new Error('WEBMCP_FIXED_DOCUMENT_INPUT_REQUIRED');
  }
}

function emitRegistration(result: WebMcpRegistrationResult): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('moirae:webmcp-registration', { detail: result }));
  }
}

function emitToolResult(toolName: string, result: unknown): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('moirae:webmcp-result', { detail: { toolName, result } }));
  }
}
