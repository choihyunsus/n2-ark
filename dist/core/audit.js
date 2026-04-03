"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = void 0;
// n2-ark — Audit Logger. Immutable record of every action checked by the Safety Gate.
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Audit Logger for n2-ark Safety Gate.
 * Records every pass/block decision as an immutable log entry.
 * Essential for compliance, debugging, and accountability.
 */
class AuditLogger {
    dir;
    enabled;
    maxAgeDays;
    logPasses;
    _buffer;
    _flushInterval;
    constructor(options = {}) {
        this.dir = options.dir ?? path.join(process.cwd(), 'data', 'audit');
        this.enabled = options.enabled !== false;
        this.maxAgeDays = options.maxAgeDays ?? 7;
        this.logPasses = options.logPasses ?? false;
        this._buffer = [];
        this._flushInterval = null;
        if (this.enabled) {
            if (!fs.existsSync(this.dir)) {
                fs.mkdirSync(this.dir, { recursive: true });
            }
            this._flushInterval = setInterval(() => this._flush(), 5000);
            this._flushInterval.unref();
            try {
                this.cleanup();
            }
            catch {
                // silent
            }
        }
    }
    /** Log a gate decision. */
    log(result, action = {}) {
        if (!this.enabled)
            return;
        if (result.allowed && !this.logPasses)
            return;
        const entry = {
            timestamp: new Date().toISOString(),
            decision: result.allowed ? 'PASS' : 'BLOCK',
            action: result.action || action.name || 'unknown',
            type: action.type || 'tool_call',
            rule: result.rule ?? null,
            reason: result.reason ?? null,
            pattern: result.pattern ?? null,
            requires: result.requires ?? null,
            currentState: result.currentState ?? null,
            layer: result.layer ?? null,
        };
        this._buffer.push(entry);
        if (!result.allowed) {
            this._flush();
        }
    }
    /** Flush buffer to disk. */
    _flush() {
        if (this._buffer.length === 0)
            return;
        const today = new Date().toISOString().slice(0, 10);
        const logFile = path.join(this.dir, `${today}.jsonl`);
        try {
            const lines = this._buffer.map(e => JSON.stringify(e)).join('\n') + '\n';
            fs.appendFileSync(logFile, lines);
            this._buffer = [];
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[n2-ark] Audit write failed: ${msg}`);
        }
    }
    /** Read audit log for a specific date. */
    read(date) {
        const logFile = path.join(this.dir, `${date}.jsonl`);
        if (!fs.existsSync(logFile))
            return [];
        try {
            return fs.readFileSync(logFile, 'utf-8')
                .split('\n')
                .filter(l => l.trim())
                .map(l => JSON.parse(l));
        }
        catch {
            return [];
        }
    }
    /** Get block statistics for a date range. */
    stats(days = 7) {
        let totalChecks = 0;
        let blocked = 0;
        const blockCounts = {};
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const entries = this.read(d.toISOString().slice(0, 10));
            for (const entry of entries) {
                totalChecks++;
                if (entry.decision === 'BLOCK') {
                    blocked++;
                    const key = entry.rule ?? 'unknown';
                    blockCounts[key] = (blockCounts[key] ?? 0) + 1;
                }
            }
        }
        const topBlocked = Object.entries(blockCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([rule, count]) => ({ rule, count }));
        return { totalChecks, blocked, passed: totalChecks - blocked, topBlocked };
    }
    /** Cleanup old audit logs. */
    cleanup() {
        if (!fs.existsSync(this.dir))
            return { deleted: 0 };
        const cutoff = Date.now() - (this.maxAgeDays * 24 * 60 * 60 * 1000);
        let deleted = 0;
        for (const file of fs.readdirSync(this.dir)) {
            if (!file.endsWith('.jsonl'))
                continue;
            const dateStr = file.replace('.jsonl', '');
            const fileDate = new Date(dateStr).getTime();
            if (fileDate < cutoff) {
                try {
                    fs.unlinkSync(path.join(this.dir, file));
                    deleted++;
                }
                catch {
                    // skip
                }
            }
        }
        return { deleted };
    }
    /** Stop the flush interval and write remaining buffer. */
    close() {
        if (this._flushInterval) {
            clearInterval(this._flushInterval);
            this._flushInterval = null;
        }
        this._flush();
    }
}
exports.AuditLogger = AuditLogger;
