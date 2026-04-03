/** Pending approval request awaiting human decision */
export interface PendingApproval {
    id: string;
    action: string;
    content: string;
    rule: string;
    reason: string;
    timestamp: number;
    status: 'pending' | 'approved' | 'denied';
    expiresAt: number;
}
/** Configuration for the approval server */
export interface ApprovalServerConfig {
    port?: number;
    host?: string;
    /** Time before pending requests auto-deny (ms). Default: 5 min */
    expirationMs?: number;
}
/**
 * Localhost HTTP server for out-of-band human approval.
 *
 * Architecture:
 *   User ←→ AI ←→ n2-ark (MCP)     ← AI mediates (can fake approval)
 *   User ←→ ApprovalServer (HTTP)   ← Direct channel (AI cannot interfere)
 *
 * When a general rule blocks an action, the approval server creates a
 * pending request visible on the dashboard. The user approves/denies
 * directly via browser — no AI involvement.
 */
export declare class ApprovalServer {
    private _server;
    private _requests;
    private readonly _port;
    private readonly _host;
    private readonly _expirationMs;
    /** Callback fired when a request is approved */
    onApprove: ((req: PendingApproval) => void) | null;
    /** Callback fired when a request is denied */
    onDeny: ((req: PendingApproval) => void) | null;
    constructor(config?: ApprovalServerConfig);
    /** Start the HTTP approval server */
    start(): Promise<void>;
    /** Stop the server */
    stop(): void;
    /** Dashboard URL */
    get url(): string;
    /** Whether the server is running */
    get running(): boolean;
    /** Create a new pending approval request. Returns the request with generated ID. */
    createRequest(action: string, content: string, rule: string, reason: string): PendingApproval;
    /** Check if a specific request was approved */
    isApproved(id: string): boolean;
    /** Get a request by ID */
    getRequest(id: string): PendingApproval | undefined;
    private _handle;
    private _decide;
    private _listByStatus;
    private _listAll;
    private _statusSummary;
    private _json;
    private _cleanup;
    private _genId;
    private _serveDashboard;
}
