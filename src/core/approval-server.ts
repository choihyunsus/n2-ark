// n2-ark Approval Server — Direct human approval channel that bypasses the AI agent.
// Uses only Node.js built-in http module (zero dependencies).
import * as http from 'http';

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
export class ApprovalServer {
  private _server: http.Server | null = null;
  private _requests: Map<string, PendingApproval> = new Map();
  private readonly _port: number;
  private readonly _host: string;
  private readonly _expirationMs: number;

  /** Callback fired when a request is approved */
  onApprove: ((req: PendingApproval) => void) | null = null;
  /** Callback fired when a request is denied */
  onDeny: ((req: PendingApproval) => void) | null = null;

  constructor(config: ApprovalServerConfig = {}) {
    this._port = config.port ?? 9720;
    this._host = config.host ?? '127.0.0.1';
    this._expirationMs = config.expirationMs ?? 5 * 60 * 1000;
  }

  /** Start the HTTP approval server */
  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._server = http.createServer((req, res) => this._handle(req, res));
      this._server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[n2-ark] Approval port ${this._port} in use, skipping`);
          this._server = null;
          resolve();
        } else {
          reject(err);
        }
      });
      this._server.listen(this._port, this._host, () => {
        console.log(`[n2-ark] Approval server: http://${this._host}:${this._port}`);
        resolve();
      });
      this._server.unref(); // Don't prevent process exit
    });
  }

  /** Stop the server */
  stop(): void {
    this._server?.close();
    this._server = null;
  }

  /** Dashboard URL */
  get url(): string {
    return `http://${this._host}:${this._port}`;
  }

  /** Whether the server is running */
  get running(): boolean {
    return this._server !== null;
  }

  /** Create a new pending approval request. Returns the request with generated ID. */
  createRequest(action: string, content: string, rule: string, reason: string): PendingApproval {
    this._cleanup();
    const id = this._genId();
    const req: PendingApproval = {
      id,
      action,
      content: content.length > 500 ? content.slice(0, 500) + '…' : content,
      rule,
      reason,
      timestamp: Date.now(),
      status: 'pending',
      expiresAt: Date.now() + this._expirationMs,
    };
    this._requests.set(id, req);
    return req;
  }

  /** Check if a specific request was approved */
  isApproved(id: string): boolean {
    return this._requests.get(id)?.status === 'approved';
  }

  /** Get a request by ID */
  getRequest(id: string): PendingApproval | undefined {
    return this._requests.get(id);
  }

  // ── HTTP Router ──

  private _handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${this._host}`);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // CORS: allow only same-origin (dashboard served from this server)
    // External origins are blocked to prevent CSRF auto-approval attacks.
    const origin = req.headers.origin ?? '';
    if (origin === `http://${this._host}:${this._port}` || origin === `http://localhost:${this._port}`) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    const p = url.pathname;
    if (p === '/' || p === '/dashboard') return this._serveDashboard(res);
    if (p === '/api/pending') return this._json(res, this._listByStatus('pending'));
    if (p === '/api/all') return this._json(res, this._listAll());
    if (p === '/api/status') return this._json(res, this._statusSummary());
    if (p.startsWith('/api/approve/')) return this._decide(p.split('/').pop()!, 'approved', res);
    if (p.startsWith('/api/deny/')) return this._decide(p.split('/').pop()!, 'denied', res);
    res.writeHead(404); res.end('Not Found');
  }

  private _decide(id: string, status: 'approved' | 'denied', res: http.ServerResponse): void {
    const req = this._requests.get(id);
    if (!req || req.status !== 'pending') {
      return this._json(res, { error: 'Not found or already resolved' }, 404);
    }
    req.status = status;
    if (status === 'approved' && this.onApprove) this.onApprove(req);
    if (status === 'denied' && this.onDeny) this.onDeny(req);
    this._json(res, { id, status, action: req.action, rule: req.rule });
  }

  private _listByStatus(status: string): PendingApproval[] {
    this._cleanup();
    return [...this._requests.values()]
      .filter(r => r.status === status)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  private _listAll(): PendingApproval[] {
    this._cleanup();
    return [...this._requests.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }

  private _statusSummary(): Record<string, number> {
    const all = [...this._requests.values()];
    return {
      pending: all.filter(r => r.status === 'pending').length,
      approved: all.filter(r => r.status === 'approved').length,
      denied: all.filter(r => r.status === 'denied').length,
    };
  }

  private _json(res: http.ServerResponse, data: unknown, code = 200): void {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private _cleanup(): void {
    const now = Date.now();
    for (const [id, req] of this._requests) {
      if (now > req.expiresAt && req.status === 'pending') {
        req.status = 'denied';
      }
      if (now - req.timestamp > 3600000) {
        this._requests.delete(id);
      }
    }
  }

  private _genId(): string {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  // ── Dashboard HTML ──

  private _serveDashboard(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(DASHBOARD_HTML);
  }
}

// ── Self-contained Dashboard (zero external dependencies) ──

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>n2-ark | Approval Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0e17;color:#e2e8f0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;min-height:100vh}
header{background:linear-gradient(135deg,#1a1f2e,#0d1117);border-bottom:1px solid #21262d;padding:20px 32px;display:flex;align-items:center;gap:16px}
h1{font-size:20px;font-weight:600;letter-spacing:-.3px}
.sub{font-size:12px;color:#484f58;margin-left:auto}
.badge{padding:3px 14px;border-radius:12px;font-size:13px;font-weight:600;transition:all .3s}
.badge.warn{background:#f85149;color:#fff;animation:pulse 2s infinite}
.badge.ok{background:#238636;color:#fff}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
.c{max-width:820px;margin:0 auto;padding:24px}
.empty{text-align:center;padding:80px 20px;color:#484f58;font-size:15px;line-height:1.6}
.empty .icon{font-size:48px;margin-bottom:12px;display:block}
.card{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:18px;margin-bottom:14px;transition:all .2s}
.card:hover{border-color:#30363d}
.card.done{opacity:.4;pointer-events:none}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.tag{background:#21262d;padding:3px 10px;border-radius:5px;font-size:12px;color:#8b949e;font-weight:500}
.tag.approved{background:#238636;color:#fff}
.tag.denied{background:#da3633;color:#fff}
.act{font-weight:700;font-size:15px;color:#f0f6fc}
.cnt{background:#0d1117;padding:10px 14px;border-radius:6px;font-family:'Cascadia Code','Fira Code',monospace;font-size:13px;color:#c9d1d9;margin:10px 0;word-break:break-all;max-height:80px;overflow:auto;border:1px solid #21262d}
.rsn{font-size:13px;color:#f85149;margin-bottom:12px;font-weight:500}
.btns{display:flex;gap:10px}
.btn{padding:10px 24px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;transition:all .15s;letter-spacing:.3px}
.btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.4)}
.btn:active{transform:translateY(0)}
.btn.y{background:linear-gradient(135deg,#238636,#2ea043);color:#fff}
.btn.n{background:#21262d;color:#8b949e;border:1px solid #30363d}
.btn.n:hover{background:linear-gradient(135deg,#da3633,#f85149);color:#fff;border-color:transparent}
.time{font-size:11px;color:#484f58;font-weight:500}
</style></head><body>
<header>
  <h1>\\u{1F6E1}\\uFE0F n2-ark</h1>
  <span class="badge ok" id="b">\\u2014</span>
  <span class="sub">Direct Approval Channel</span>
</header>
<div class="c" id="L"><div class="empty"><span class="icon">\\u{1F6E1}\\uFE0F</span>Loading...</div></div>
<script>
var $=function(id){return document.getElementById(id)};
var esc=function(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML};
var ago=function(t){var s=Math.floor((Date.now()-t)/1e3);if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m';return Math.floor(s/3600)+'h'};

function renderCard(i){
  var cls=i.status!=='pending'?' done':'';
  var h='<div class="card'+cls+'"><div class="row">';
  h+='<span class="act">'+esc(i.action)+'</span>';
  h+='<span class="tag">'+esc(i.rule)+'</span>';
  if(i.status!=='pending')h+='<span class="tag '+i.status+'">'+i.status.toUpperCase()+'</span>';
  h+='<span class="time">'+ago(i.timestamp)+' ago</span>';
  h+='</div>';
  if(i.content)h+='<div class="cnt">'+esc(i.content)+'</div>';
  h+='<div class="rsn">'+esc(i.reason)+'</div>';
  if(i.status==='pending'){
    h+='<div class="btns">';
    h+="<button class='btn y' onclick=\\"decide('"+i.id+"','approve')\\">\\u2705 Approve</button>";
    h+="<button class='btn n' onclick=\\"decide('"+i.id+"','deny')\\">\\u2716 Deny</button>";
    h+='</div>';
  }
  h+='</div>';
  return h;
}

function load(){
  fetch('/api/all').then(function(r){return r.json()}).then(function(all){
    var p=all.filter(function(r){return r.status==='pending'}).length;
    $('b').textContent=p?p+' pending':'All clear';
    $('b').className='badge '+(p?'warn':'ok');
    if(!all.length){
      $('L').innerHTML='<div class="empty"><span class="icon">\\u2705</span>No requests yet.<br>Blocked actions will appear here for your approval.</div>';
      return;
    }
    $('L').innerHTML=all.map(renderCard).join('');
  }).catch(function(e){console.error(e)});
}

function decide(id,action){
  fetch('/api/'+action+'/'+id,{method:'POST'}).then(function(){load()});
}

load();
setInterval(load,2000);
</script></body></html>`;
