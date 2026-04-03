import type { AuditEntry, AuditOptions, AuditStats, GateCheckResult } from '../types';
/**
 * Audit Logger for n2-ark Safety Gate.
 * Records every pass/block decision as an immutable log entry.
 * Essential for compliance, debugging, and accountability.
 */
export declare class AuditLogger {
    private readonly dir;
    private readonly enabled;
    private readonly maxAgeDays;
    private readonly logPasses;
    private _buffer;
    private _flushInterval;
    constructor(options?: AuditOptions);
    /** Log a gate decision. */
    log(result: GateCheckResult, action?: {
        type?: string;
        name?: string;
    }): void;
    /** Flush buffer to disk. */
    private _flush;
    /** Read audit log for a specific date. */
    read(date: string): AuditEntry[];
    /** Get block statistics for a date range. */
    stats(days?: number): AuditStats;
    /** Cleanup old audit logs. */
    cleanup(): {
        deleted: number;
    };
    /** Stop the flush interval and write remaining buffer. */
    close(): void;
}
