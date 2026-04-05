/**
 * Brain IPC Handler
 * Connects Electron app to Python Brain backend
 * 
 * Routes through:
 * - Task orchestration (route to best model/agent)
 * - Memory operations (store, search, retrieve)
 * - Background analysis (patterns, style)
 * - Learning from outcomes
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as http from 'http';
import { createLogger } from '../core/logger';

const log = createLogger('Brain');

// Use 127.0.0.1 explicitly to avoid IPv6 issues (::1 vs 127.0.0.1)
const BRAIN_URL = process.env.BRAIN_URL || 'http://127.0.0.1:8000';

interface BrainResponse {
    success: boolean;
    data?: any;
    error?: string;
}

let brainReady = false;
let brainReadyPromise: Promise<void> | null = null;

/**
 * Wait for the Brain backend to come online (called once at startup).
 * Resolves as soon as /api/status returns 200.
 */
function waitForBrain(): Promise<void> {
    if (brainReady) return Promise.resolve();
    if (brainReadyPromise) return brainReadyPromise;

    brainReadyPromise = (async () => {
        const maxAttempts = 15;
        let delayMs = 500;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const ok = await rawBrainRequest('GET', '/api/status');
            if (ok.success) {
                brainReady = true;
                log.info(`Backend connected (attempt ${attempt}/${maxAttempts})`);
                return;
            }
            await new Promise(r => setTimeout(r, delayMs));
            delayMs = Math.min(delayMs * 2, 4000);
        }
        log.warn('Backend did not respond after startup polling — requests will use fallbacks');
    })();
    return brainReadyPromise;
}

/**
 * Low-level HTTP request (no retry, no startup gate).
 */
function rawBrainRequest(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: any
): Promise<BrainResponse> {
    return new Promise((resolve) => {
        const url = new URL(`${BRAIN_URL}${endpoint}`);

        const options = {
            hostname: url.hostname,
            port: url.port || 8000,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ success: true, data: parsed });
                } catch (e) {
                    resolve({ success: false, error: `Failed to parse response: ${data}` });
                }
            });
        });

        req.on('error', () => {
            resolve({ success: false, error: 'Connection refused' });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout' });
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Make a request to the Python Brain API.
 * Waits for backend readiness on the first call, then passes through.
 */
async function brainRequest(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: any
): Promise<BrainResponse> {
    if (!brainReady) {
        await waitForBrain();
    }
    return rawBrainRequest(method, endpoint, body);
}

/**
 * Check if Python Brain is available
 */
async function isBrainAvailable(): Promise<boolean> {
    if (brainReady) return true;
    const response = await rawBrainRequest('GET', '/api/status');
    if (response.success) brainReady = true;
    return response.success;
}

/**
 * Register all brain IPC handlers
 */
export function registerBrainHandlers(): void {
    log.info('Registering IPC handlers...');
    
    // ============ ORCHESTRATION ============
    
    /**
     * Route a task to the appropriate agent/model
     * Returns routing decision with suggested model, agent type, complexity, etc.
     */
    ipcMain.handle('brain:route', async (_event: IpcMainInvokeEvent, message: string, context?: any) => {
        const response = await brainRequest('POST', '/api/brain/route', {
            message,
            context: context || {}
        });
        
        if (!response.success) {
            // Fallback routing if brain is unavailable
            log.warn('Brain unavailable, using fallback routing');
            return {
                task_type: 'code_generation',
                model_tier: 'standard',
                agent_type: 'electron_agent',
                suggested_model: 'qwen3-coder:480b-cloud',
                complexity_score: 5,
                reasoning: 'Fallback routing (brain unavailable)',
                context_needed: [],
                estimated_steps: 5,
                confidence: 0.5
            };
        }
        
        return response.data;
    });
    
    /**
     * Record the outcome of a task for learning
     */
    ipcMain.handle('brain:record-outcome', async (
        _event: IpcMainInvokeEvent, 
        message: string, 
        success: boolean,
        actualModel?: string,
        actualSteps?: number
    ) => {
        const response = await brainRequest('POST', '/api/brain/outcome', {
            message,
            success,
            actual_model: actualModel,
            actual_steps: actualSteps
        });
        return response.success;
    });
    
    // ============ MEMORY ============
    
    /**
     * Store a memory
     */
    ipcMain.handle('brain:memory-store', async (
        _event: IpcMainInvokeEvent,
        type: string,
        content: string,
        metadata?: any
    ) => {
        const response = await brainRequest('POST', '/api/brain/memory/store', {
            type,
            content,
            metadata: metadata || {}
        });
        return response.data;
    });
    
    /**
     * Search memories semantically
     */
    ipcMain.handle('brain:memory-search', async (
        _event: IpcMainInvokeEvent,
        query: string,
        type?: string,
        limit: number = 10
    ) => {
        const response = await brainRequest('POST', '/api/brain/memory/search', {
            query,
            type,
            limit
        });
        return response.success ? response.data : [];
    });
    
    /**
     * Get memories by type
     */
    ipcMain.handle('brain:memory-by-type', async (
        _event: IpcMainInvokeEvent,
        type: string,
        limit: number = 50
    ) => {
        const response = await brainRequest('GET', `/api/brain/memory/type/${type}?limit=${limit}`);
        return response.success ? response.data : [];
    });
    
    /**
     * Update memory success rate
     */
    ipcMain.handle('brain:memory-update-success', async (
        _event: IpcMainInvokeEvent,
        memoryId: string,
        success: boolean
    ) => {
        const response = await brainRequest('POST', `/api/brain/memory/${memoryId}/success?success=${success}`);
        return response.success;
    });
    
    // ============ CONVERSATION ============
    
    /**
     * Save a conversation message
     */
    ipcMain.handle('brain:save-conversation', async (
        _event: IpcMainInvokeEvent,
        sessionId: string,
        role: string,
        content: string,
        model?: string,
        tokens?: number
    ) => {
        const response = await brainRequest('POST', '/api/brain/conversation', {
            session_id: sessionId,
            role,
            content,
            model,
            tokens: tokens || 0
        });
        return response.success;
    });
    
    /**
     * Get conversation history
     */
    ipcMain.handle('brain:get-conversation', async (
        _event: IpcMainInvokeEvent,
        sessionId: string,
        limit: number = 50
    ) => {
        const response = await brainRequest('GET', `/api/brain/conversation/${sessionId}?limit=${limit}`);
        return response.success ? response.data?.messages || [] : [];
    });
    
    /**
     * Get recent sessions
     */
    ipcMain.handle('brain:get-sessions', async (_event: IpcMainInvokeEvent, limit: number = 10) => {
        const response = await brainRequest('GET', `/api/brain/sessions?limit=${limit}`);
        return response.success ? response.data?.sessions || [] : [];
    });
    
    // ============ CODE ANALYSIS ============
    
    /**
     * Trigger workspace analysis
     */
    ipcMain.handle('brain:analyze', async (
        _event: IpcMainInvokeEvent,
        workspacePath: string,
        background: boolean = true
    ) => {
        const response = await brainRequest('POST', '/api/brain/analyze', {
            workspace_path: workspacePath,
            background
        });
        return response.data;
    });
    
    /**
     * Get analysis status
     */
    ipcMain.handle('brain:analyze-status', async (_event: IpcMainInvokeEvent) => {
        const response = await brainRequest('GET', '/api/brain/analyze/status');
        return response.success ? response.data : { is_running: false };
    });
    
    /**
     * Get detected code patterns
     */
    ipcMain.handle('brain:get-patterns', async (
        _event: IpcMainInvokeEvent,
        language?: string,
        limit: number = 20
    ) => {
        const query = language ? `?language=${language}&limit=${limit}` : `?limit=${limit}`;
        const response = await brainRequest('GET', `/api/brain/patterns${query}`);
        return response.success ? response.data?.patterns || [] : [];
    });
    
    /**
     * Get detected coding style
     */
    ipcMain.handle('brain:get-style', async (_event: IpcMainInvokeEvent) => {
        const response = await brainRequest('GET', '/api/brain/style');
        return response.success ? response.data?.style : null;
    });
    
    // ============ PREFERENCES ============
    
    /**
     * Set a preference
     */
    ipcMain.handle('brain:set-preference', async (
        _event: IpcMainInvokeEvent,
        key: string,
        value: any
    ) => {
        const response = await brainRequest('POST', '/api/brain/preferences', { key, value });
        return response.success;
    });
    
    /**
     * Get a preference
     */
    ipcMain.handle('brain:get-preference', async (
        _event: IpcMainInvokeEvent,
        key: string,
        defaultValue?: any
    ) => {
        const response = await brainRequest('GET', `/api/brain/preferences/${key}`);
        return response.success ? response.data?.value : defaultValue;
    });
    
    /**
     * Get all preferences
     */
    ipcMain.handle('brain:get-all-preferences', async (_event: IpcMainInvokeEvent) => {
        const response = await brainRequest('GET', '/api/brain/preferences');
        return response.success ? response.data?.preferences || {} : {};
    });
    
    // ============ STATS ============
    
    /**
     * Get brain statistics
     */
    ipcMain.handle('brain:stats', async (_event: IpcMainInvokeEvent) => {
        const response = await brainRequest('GET', '/api/brain/stats');
        return response.success ? response.data : {
            memory: { total_memories: 0, total_code_patterns: 0 },
            orchestrator: { decisions_in_session: 0 },
            analyzer: { is_running: false }
        };
    });
    
    /**
     * Check if brain is available
     */
    ipcMain.handle('brain:available', async (_event: IpcMainInvokeEvent) => {
        return await isBrainAvailable();
    });
    
    log.info('IPC handlers registered');

    // Start background polling so first real request doesn't block
    waitForBrain().catch(() => {});
}

// Export for use in main process
export { isBrainAvailable, brainRequest };

