import { useState, useRef, useEffect, useMemo } from "react";

const injectFonts = () => {
  if (document.getElementById("cc-fonts")) return;
  const s = document.createElement("style");
  s.id = "cc-fonts";
  s.textContent = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap');`;
  document.head.appendChild(s);
};

const PRICING = [
  { match: "haiku-4-5",  in: 1.00,  out: 5.00  },
  { match: "haiku",      in: 1.00,  out: 5.00  },
  { match: "sonnet-4-6", in: 3.00,  out: 15.00 },
  { match: "sonnet",     in: 3.00,  out: 15.00 },
  { match: "opus-4-7",   in: 5.00,  out: 25.00 },
  { match: "opus-4-6",   in: 5.00,  out: 25.00 },
  { match: "opus-4-5",   in: 5.00,  out: 25.00 },
  { match: "sonnet-4-5", in: 3.00,  out: 15.00 },
  { match: "opus",       in: 5.00,  out: 25.00 },
];

const CAPS = [
  { match: "haiku-4-5",  effort: false, adaptive: false, modes: ["off","extended"] },
  { match: "haiku",      effort: false, adaptive: false, modes: ["off","extended"] },
  { match: "sonnet-4-6", effort: true,  adaptive: true,  modes: ["off","extended","adaptive"] },
  { match: "opus-4-7",   effort: true,  adaptive: true,  modes: ["off","extended","adaptive"] },
  { match: "opus-4-6",   effort: true,  adaptive: true,  modes: ["off","extended","adaptive"] },
  { match: "sonnet",     effort: true,  adaptive: true,  modes: ["off","extended","adaptive"] },
  { match: "opus",       effort: true,  adaptive: true,  modes: ["off","extended","adaptive"] },
];

const FALLBACK_MODELS = [
  { id: "claude-opus-4-6",           display_name: "Claude Opus 4.6"   },
  { id: "claude-sonnet-4-6",         display_name: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5"  },
];

const LS_KEY         = "claude_estimator_api_key";
const CTX_WINDOW     = 200000;

const lookup   = (table, id) => table.find(r => id.toLowerCase().includes(r.match));
const getPrice = (id) => lookup(PRICING, id) || { in: 3.00, out: 15.00 };
const getCaps  = (id) => lookup(CAPS, id)    || { effort: true, adaptive: true, modes: ["off","extended","adaptive"] };

const EFFORTS = ["low","medium","high","max"];

const T = {
  bg0: "#181715", bg1: "#1f1e1b", bg2: "#252320", bg3: "#2e2c28",
  hairline: "rgba(250,249,245,0.08)", hairline2: "rgba(250,249,245,0.14)",
  coral: "#cc785c", coralDim: "rgba(204,120,92,0.15)", coralBorder: "rgba(204,120,92,0.4)",
  onCoral: "#ffffff", onDark: "#faf9f5", onDarkSoft: "#a09d96", muted: "#6c6a64",
  red: "#e05c5c", redBg: "rgba(224,92,92,0.12)", green: "#5db8a6",
  blue: "#93c5fd",
  serif: "'Cormorant Garamond', 'Times New Roman', serif",
  sans: "'Inter', sans-serif", mono: "'JetBrains Mono', monospace",
};

const fmt      = (n) => n.toLocaleString();
const fmtCost  = (n) => n < 0.0001 ? "<$0.0001" : n < 0.001 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;
const calcCost = (tok, rate) => (tok / 1_000_000) * rate;
const crossCost = (inTok, likelyOut, thinkFrac, modelId) => {
  const p = getPrice(modelId);
  const think = getCaps(modelId).modes.includes("extended") ? Math.round(likelyOut * thinkFrac) : 0;
  return calcCost(inTok, p.in) + calcCost(likelyOut + think, p.out);
};

const apiHeaders = (key) => ({
  "Content-Type": "application/json",
  "x-api-key": key,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
});

// ── File helpers ──────────────────────────────────────────────────────────────
const ACCEPTED = ".pdf,.txt,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif";

const fileToBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = () => rej(new Error("Read failed"));
  r.readAsDataURL(file);
});

const readAsText = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(new Error("Read failed"));
  r.readAsText(file);
});

const IMAGE_TYPES = ["image/png","image/jpeg","image/webp","image/gif"];
const DOCX_TYPES  = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/msword"];

let mammothLoaded = false;
const loadMammoth = () => new Promise((res) => {
  if (window.mammoth) { res(window.mammoth); return; }
  if (mammothLoaded) { const iv = setInterval(() => { if (window.mammoth) { clearInterval(iv); res(window.mammoth); } }, 100); return; }
  mammothLoaded = true;
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
  s.onload = () => res(window.mammoth);
  document.head.appendChild(s);
});

const processFile = async (file) => {
  if (IMAGE_TYPES.includes(file.type)) {
    const data = await fileToBase64(file);
    return { type: "image", mediaType: file.type, data, name: file.name, size: file.size };
  }
  if (file.type === "application/pdf") {
    const data = await fileToBase64(file);
    return { type: "pdf", data, name: file.name, size: file.size };
  }
  if (DOCX_TYPES.includes(file.type) || file.name.endsWith(".docx") || file.name.endsWith(".doc")) {
    const mammoth = await loadMammoth();
    const ab = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: ab });
    return { type: "text", text: result.value, name: file.name, size: file.size };
  }
  const text = await readAsText(file);
  return { type: "text", text, name: file.name, size: file.size };
};

const attachmentToContentBlock = (att) => {
  if (att.type === "image") return { type: "image", source: { type: "base64", media_type: att.mediaType, data: att.data } };
  if (att.type === "pdf")   return { type: "document", source: { type: "base64", media_type: "application/pdf", data: att.data } };
  return { type: "text", text: `[File: ${att.name}]\n\n${att.text}` };
};

const fmtSize = (b) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`;

// ── Prompt optimizer helper ───────────────────────────────────────────────────
const optimizePrompt = async (text, apiKey) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: apiHeaders(apiKey),
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "You are a prompt optimization expert. Rewrite the given prompt to use fewer tokens while preserving all meaning and intent. Return ONLY the optimized prompt text, no explanation.",
      messages: [{ role: "user", content: `Optimize this prompt to use fewer tokens:\n\n${text}` }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || text;
};

// ── Model router helper ───────────────────────────────────────────────────────
const MODEL_TIERS = [
  { label: "Haiku",  match: "haiku",  color: T.green },
  { label: "Sonnet", match: "sonnet", color: T.coral },
  { label: "Opus",   match: "opus",   color: T.blue  },
];

const classifyComplexity = (text) => {
  const words = text.split(/\s+/).length;
  const hasCode   = /```|function|class |import |const |def |SELECT |FROM /i.test(text);
  const hasAnalysis = /analyze|compare|explain|evaluate|critique|strategy|architecture/i.test(text);
  const hasSimple = words < 30 && !hasCode && !hasAnalysis;
  if (hasSimple) return "haiku";
  if (hasCode || hasAnalysis || words > 200) return "opus";
  return "sonnet";
};

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ tip, children, pos = "top", maxW = 220 }) {
  const [show, setShow] = useState(false);
  if (!tip) return children;
  const isTop = pos === "top";
  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: "absolute",
          bottom: isTop ? "calc(100% + 8px)" : undefined,
          top: isTop ? undefined : "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#242220",
          color: "#d6d2cc",
          fontSize: 12,
          lineHeight: 1.45,
          padding: "6px 10px",
          borderRadius: 6,
          pointerEvents: "none",
          border: "1px solid rgba(250,249,245,0.12)",
          zIndex: 9999,
          maxWidth: maxW,
          width: "max-content",
          textAlign: "center",
          whiteSpace: "normal",
        }}>
          {tip}
          <div style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            ...(isTop ? {
              top: "100%",
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid #242220",
            } : {
              bottom: "100%",
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderBottom: "5px solid #242220",
            }),
          }} />
        </div>
      )}
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────
function Pill({ active, color = "default", onClick, children, disabled }) {
  const colors = {
    coral:   { bg: T.coralDim,    border: T.coralBorder, text: T.coral     },
    default: { bg: "transparent", border: T.hairline,    text: T.onDarkSoft },
  };
  const c = colors[color] || colors.default;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: T.sans, fontSize: 14, padding: "6px 13px", borderRadius: 8,
      border: `1px solid ${active ? c.border : T.hairline}`,
      background: active ? c.bg : "transparent",
      color: active ? c.text : T.onDarkSoft,
      fontWeight: active ? 500 : 400,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.12s", opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}

function Lbl({ children }) {
  return <span style={{ fontFamily: T.sans, fontSize: 13, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", fontWeight: 500 }}>{children}</span>;
}

function Badge({ children }) {
  return <span style={{ fontSize: 10, background: T.coralDim, color: T.coral, border: `1px solid ${T.coralBorder}`, borderRadius: 4, padding: "1px 5px", fontWeight: 500, letterSpacing: "0.04em", verticalAlign: "middle", marginLeft: 4 }}>{children}</span>;
}

function AttachmentChip({ att, onRemove }) {
  const icons = { image: "🖼", pdf: "📄", text: "📝" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.bg2, border: `1px solid ${T.hairline2}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, color: T.onDarkSoft, fontFamily: T.sans, maxWidth: 200 }}>
      <span>{icons[att.type] || "📎"}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{att.name}</span>
      <span style={{ color: T.muted, fontSize: 11, flexShrink: 0 }}>{fmtSize(att.size)}</span>
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
    </div>
  );
}

// ── Context Window Bar ────────────────────────────────────────────────────────
function ContextBar({ sysTokens, historyTokens, lastTokens }) {
  const total = sysTokens + historyTokens + lastTokens;
  const pct   = (total / CTX_WINDOW) * 100;
  const sysPct  = (sysTokens / CTX_WINDOW) * 100;
  const hisPct  = (historyTokens / CTX_WINDOW) * 100;
  const lastPct = (lastTokens / CTX_WINDOW) * 100;

  const legend = [
    { color: T.coral,    label: `sys prompt ${fmt(sysTokens)}`,       tip: "Your system prompt — sent as input every message" },
    { color: T.green,    label: `history ${fmt(historyTokens)}`,       tip: "All previous messages in this session" },
    { color: T.blue,     label: `last msg ${fmt(lastTokens)}`,         tip: "Your current input (word-count estimate)" },
    { color: T.hairline2,label: `available ${fmt(CTX_WINDOW - total)}`,tip: "Remaining context capacity before hitting the 200k limit" },
  ];

  return (
    <div style={{ background: T.bg1, borderBottom: `1px solid ${T.hairline}`, padding: "8px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Context window <Badge>new</Badge>
        </span>
        <Tooltip tip={`${pct.toFixed(1)}% of the 200k context window used across all inputs`} pos="top">
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.onDarkSoft, cursor: "default" }}>
            {fmt(total)} / {fmt(CTX_WINDOW)}
            <span style={{ color: pct > 80 ? T.red : T.green, marginLeft: 6 }}>{pct.toFixed(1)}% used</span>
          </span>
        </Tooltip>
      </div>
      <div style={{ height: 5, background: T.hairline, borderRadius: 99, overflow: "hidden", display: "flex", gap: 1 }}>
        {sysPct > 0  && <div style={{ width: `${sysPct}%`,  background: T.coral, borderRadius: 2 }} />}
        {hisPct > 0  && <div style={{ width: `${hisPct}%`,  background: T.green, borderRadius: 2 }} />}
        {lastPct > 0 && <div style={{ width: `${lastPct}%`, background: T.blue,  borderRadius: 2 }} />}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 5 }}>
        {legend.map(({ color, label, tip }) => (
          <Tooltip key={label} tip={tip} pos="bottom">
            <div style={{ display: "flex", alignItems: "center", gap: 5, cursor: "default" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.muted }}>{label}</span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

// ── Feature Panels ────────────────────────────────────────────────────────────
function CostProjector({ perMsgCost, models, lastMsgTokens }) {
  const [calls, setCalls] = useState(10000);
  const monthly = perMsgCost * calls;
  const yearly  = monthly * 12;
  const haikuId = models.find(m => m.id.toLowerCase().includes("haiku"))?.id || "";
  const haikuCost = haikuId ? calcCost(lastMsgTokens, getPrice(haikuId).in) * calls : 0;
  const saving = monthly - haikuCost;

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        Cost projector <Badge>new</Badge>
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>
        Per message: <span style={{ color: T.onDark }}>{fmtCost(perMsgCost)}</span>
      </div>
      <Tooltip tip="Drag to project cost at different call volumes" pos="top">
        <input type="range" min={100} max={100000} step={100} value={calls}
          onChange={e => setCalls(Number(e.target.value))}
          style={{ width: "100%", accentColor: T.coral, marginBottom: 4 }} />
      </Tooltip>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{fmt(calls)} calls/mo</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div style={{ background: T.bg2, borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>Monthly</div>
          <div style={{ fontFamily: T.serif, fontSize: 20, color: T.onDark }}>{fmtCost(monthly)}</div>
        </div>
        <div style={{ background: T.bg2, borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>Yearly</div>
          <div style={{ fontFamily: T.serif, fontSize: 20, color: yearly > 100 ? T.red : T.onDark }}>{fmtCost(yearly)}</div>
        </div>
      </div>
      {haikuCost > 0 && saving > 0 && (
        <div style={{ fontSize: 11, color: T.green, marginTop: 8 }}>
          on Haiku: {fmtCost(haikuCost)}/mo · save {fmtCost(saving)}
        </div>
      )}
    </div>
  );
}

function PromptOptimizer({ sysPrompt, setSysPrompt, apiKey }) {
  const [optimized, setOptimized]   = useState(null);
  const [origTokens, setOrigTokens] = useState(0);
  const [optTokens, setOptTokens]   = useState(0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const estimate = (text) => Math.ceil(text.split(/\s+/).length * 1.3);

  const run = async () => {
    if (!sysPrompt.trim()) { setError("Add a system prompt first — click sys prompt above."); return; }
    setLoading(true); setError(null);
    try {
      const result = await optimizePrompt(sysPrompt, apiKey);
      setOptimized(result);
      setOrigTokens(estimate(sysPrompt));
      setOptTokens(estimate(result));
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const apply = () => { setSysPrompt(optimized); setOptimized(null); };
  const saved = origTokens - optTokens;
  const savedPct = origTokens > 0 ? Math.round((saved / origTokens) * 100) : 0;

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        Prompt optimizer <Badge>new</Badge>
      </div>

      {!optimized && !loading && (
        <>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
            {sysPrompt.trim()
              ? `System prompt: ~${estimate(sysPrompt)} tokens. Click to optimize.`
              : "Add a system prompt (click sys prompt above) to optimize it."}
          </div>
          {error && <div style={{ fontSize: 11, color: T.red, marginBottom: 8 }}>{error}</div>}
          <Tooltip tip="Rewrites your system prompt via Haiku to use fewer tokens with same intent" pos="top">
            <button onClick={run} disabled={!sysPrompt.trim()} style={{
              width: "100%", fontFamily: T.sans, fontSize: 12, fontWeight: 500,
              background: T.coralDim, border: `1px solid ${T.coralBorder}`, color: T.coral,
              borderRadius: 6, padding: "7px", cursor: sysPrompt.trim() ? "pointer" : "not-allowed",
              opacity: sysPrompt.trim() ? 1 : 0.4,
            }}>optimize →</button>
          </Tooltip>
        </>
      )}

      {loading && <div style={{ fontSize: 12, color: T.muted }}>optimizing with Haiku…</div>}

      {optimized && (
        <>
          <div style={{ background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.2)", borderRadius: 6, padding: "7px 9px", fontSize: 12, color: T.onDarkSoft, marginBottom: 5, lineHeight: 1.5 }}>
            <span style={{ fontSize: 10, color: T.red, display: "block", marginBottom: 3 }}>BEFORE · ~{origTokens} tokens</span>
            {sysPrompt.slice(0, 120)}{sysPrompt.length > 120 ? "…" : ""}
          </div>
          <div style={{ background: "rgba(93,184,166,0.08)", border: "1px solid rgba(93,184,166,0.2)", borderRadius: 6, padding: "7px 9px", fontSize: 12, color: T.onDarkSoft, marginBottom: 8, lineHeight: 1.5 }}>
            <span style={{ fontSize: 10, color: T.green, display: "block", marginBottom: 3 }}>AFTER · ~{optTokens} tokens</span>
            {optimized.slice(0, 120)}{optimized.length > 120 ? "…" : ""}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: T.green }}>saved ~{saved} tokens ({savedPct}%)</span>
            <div style={{ display: "flex", gap: 5 }}>
              <Tooltip tip="Discard optimized version, keep original" pos="top">
                <button onClick={() => setOptimized(null)} style={{ fontSize: 11, background: "transparent", border: `1px solid ${T.hairline2}`, color: T.muted, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>discard</button>
              </Tooltip>
              <Tooltip tip="Replace your system prompt with the optimized version" pos="top">
                <button onClick={apply} style={{ fontSize: 11, background: T.coralDim, border: `1px solid ${T.coralBorder}`, color: T.coral, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 500 }}>apply →</button>
              </Tooltip>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ModelRouter({ messages, modelId, setModelId }) {
  const analysis = useMemo(() => {
    if (messages.length === 0) return null;
    const recent = messages.filter(m => m.role === "user").slice(-10);
    if (recent.length === 0) return null;
    const counts = { haiku: 0, sonnet: 0, opus: 0 };
    recent.forEach(m => { const tier = classifyComplexity(m.text || ""); counts[tier]++; });
    const total = recent.length;
    return {
      haiku:  Math.round((counts.haiku  / total) * 100),
      sonnet: Math.round((counts.sonnet / total) * 100),
      opus:   Math.round((counts.opus   / total) * 100),
      suggested: counts.haiku >= counts.sonnet && counts.haiku >= counts.opus ? "haiku"
               : counts.opus  >= counts.sonnet ? "opus" : "sonnet",
      total,
    };
  }, [messages]);

  const tiers = [
    { key: "haiku",  label: "Haiku",  color: T.green, tip: "Simple, short, or conversational queries" },
    { key: "sonnet", label: "Sonnet", color: T.coral, tip: "Medium complexity — coding, analysis, writing" },
    { key: "opus",   label: "Opus",   color: T.blue,  tip: "Complex reasoning, long docs, architecture" },
  ];

  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        Model router <Badge>new</Badge>
      </div>

      {!analysis ? (
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>Send a few messages to get routing suggestions based on query complexity.</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Based on last {analysis.total} messages</div>
          {tiers.map(({ key, label, color, tip }) => (
            <Tooltip key={key} tip={tip} pos="top">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, width: "100%", cursor: "default" }}>
                <span style={{ fontSize: 12, color: T.onDarkSoft, minWidth: 48 }}>{label}</span>
                <div style={{ flex: 1, background: T.hairline, borderRadius: 99, height: 5, overflow: "hidden" }}>
                  <div style={{ width: `${analysis[key]}%`, height: "100%", background: color, borderRadius: 99 }} />
                </div>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.onDark, minWidth: 32, textAlign: "right" }}>{analysis[key]}%</span>
              </div>
            </Tooltip>
          ))}
          {analysis.suggested && (
            <div style={{ fontSize: 11, color: T.green, border: "1px solid rgba(93,184,166,0.3)", borderRadius: 5, padding: "5px 8px", marginTop: 6, lineHeight: 1.5 }}>
              {analysis.haiku >= 60
                ? `${analysis.haiku}% of queries could use Haiku — cheaper & faster`
                : analysis.opus >= 40
                ? `${analysis.opus}% of queries need Opus-level reasoning`
                : "Sonnet is a good fit for your current usage mix"}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── API Key Gate ──────────────────────────────────────────────────────────────
function ApiKeyScreen({ onSave }) {
  const [val, setVal]         = useState("");
  const [show, setShow]       = useState(false);
  const [err, setErr]         = useState(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    const key = val.trim();
    if (!key) return;
    setTesting(true); setErr(null);
    try {
      const res  = await fetch("https://api.anthropic.com/v1/models", { headers: apiHeaders(key) });
      const data = await res.json();
      if (data.error) setErr(data.error.message);
      else { localStorage.setItem(LS_KEY, key); onSave(key); }
    } catch (e) { setErr(e.message); }
    setTesting(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg0, fontFamily: T.sans, gap: 24, padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: T.serif, fontSize: 36, fontWeight: 400, color: T.onDark, letterSpacing: "-0.5px", marginBottom: 8 }}>Claude Token Estimator</div>
        <div style={{ fontSize: 13, color: T.muted }}>counts tokens and estimates cost before every API call</div>
      </div>
      <div style={{ width: "100%", maxWidth: 420, background: T.bg1, border: `1px solid ${T.hairline2}`, borderRadius: 12, padding: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Anthropic API Key</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input type={show ? "text" : "password"} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && test()} placeholder="sk-ant-..."
            style={{ flex: 1, fontFamily: T.mono, fontSize: 13, padding: "10px 12px", background: T.bg0, color: T.onDark, border: `1px solid ${T.hairline2}`, borderRadius: 8, outline: "none" }} />
          <button onClick={() => setShow(s => !s)} style={{ fontFamily: T.sans, fontSize: 12, color: T.onDarkSoft, background: "transparent", border: `1px solid ${T.hairline2}`, borderRadius: 8, padding: "0 12px", cursor: "pointer" }}>{show ? "hide" : "show"}</button>
        </div>
        {err && <div style={{ fontSize: 12, color: T.red, marginBottom: 10 }}>{err}</div>}
        <button onClick={test} disabled={testing || !val.trim()} style={{ width: "100%", fontFamily: T.sans, fontSize: 13, fontWeight: 500, padding: "10px", borderRadius: 8, border: "none", background: T.coral, color: T.onCoral, cursor: testing || !val.trim() ? "not-allowed" : "pointer", opacity: testing || !val.trim() ? 0.5 : 1, transition: "all 0.12s" }}>
          {testing ? "verifying…" : "save & connect →"}
        </button>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 14, lineHeight: 1.7 }}>
          Your key is stored only in your browser's localStorage. It is never sent anywhere except directly to api.anthropic.com.
          Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: T.coral }}>console.anthropic.com</a>.
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 420, background: T.bg1, border: `1px solid ${T.hairline2}`, borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 13, color: T.onDark, marginBottom: 10, lineHeight: 1.6 }}>
          Don't want to run the standalone app? You can drop the token estimator directly into any Claude chat as an artifact — no API key required since claude.ai handles auth.
        </div>
        <a href="/snippet.txt" download="claude-token-estimator-snippet.txt" style={{ display: "block", textAlign: "center", fontFamily: T.sans, fontSize: 13, fontWeight: 500, color: T.onDarkSoft, textDecoration: "none", border: `1px solid ${T.hairline2}`, borderRadius: 8, padding: "10px", cursor: "pointer" }}>download snippet ↓</a>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 10, lineHeight: 1.6 }}>
          Open the file, copy all, paste into a new empty chat at <a href="https://claude.ai" target="_blank" rel="noreferrer" style={{ color: T.coral }}>claude.ai</a> and hit send.
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => { injectFonts(); }, []);

  const [apiKey, setApiKey]           = useState(() => localStorage.getItem(LS_KEY) || "");
  const [models, setModels]           = useState([]);
  const [modelsLoading, setML]        = useState(false);
  const [modelId, setModelId]         = useState("claude-sonnet-4-6");
  const [mode, setMode]               = useState("adaptive");
  const [effort, setEffort]           = useState("medium");
  const [budget, setBudget]           = useState(8000);
  const [maxTok, setMaxTok]           = useState(16000);
  const [showThink, setShowThink]     = useState(true);
  const [sysPrompt, setSysPrompt]     = useState("");
  const [showSys, setShowSys]         = useState(false);
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [attachments, setAttachments] = useState([]);
  const [processing, setProcessing]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const [counting, setCounting]       = useState(false);
  const [error, setError]             = useState(null);
  const [total, setTotal]             = useState({ in: 0, out: 0, cost: 0 });
  const [expanded, setExpanded]       = useState({});
  const [estimate, setEstimate]       = useState(null);
  const [showKeyEdit, setShowKeyEdit] = useState(false);
  const [showPanels, setShowPanels]   = useState(false); // off by default
  const [ctxTokens, setCtxTokens]     = useState({ sys: 0, history: 0, last: 0 });
  const bottomRef = useRef(null);
  const fileRef   = useRef(null);

  const loadModels = (key) => {
    setML(true);
    fetch("https://api.anthropic.com/v1/models", { headers: apiHeaders(key) })
      .then(r => r.json())
      .then(data => {
        const list = (data.data || []).filter(m => m.id.startsWith("claude-"))
          .sort((a, b) => { const tier = id => id.includes("opus")?0:id.includes("sonnet")?1:2; const td=tier(a.id)-tier(b.id); return td!==0?td:b.id.localeCompare(a.id); });
        setModels(list.length > 0 ? list : FALLBACK_MODELS);
        const def = list.find(m => m.id.includes("sonnet")) || list[0];
        if (def) setModelId(def.id);
      })
      .catch(() => setModels(FALLBACK_MODELS))
      .finally(() => setML(false));
  };

  useEffect(() => { if (apiKey) loadModels(apiKey); }, [apiKey]);

  const forgetKey = () => { localStorage.removeItem(LS_KEY); setApiKey(""); setModels([]); };

  const caps       = getCaps(modelId);
  const price      = getPrice(modelId);
  const safeBudget = Math.min(budget, maxTok - 512);

  useEffect(() => { if (!caps.modes.includes(mode)) setMode(caps.modes[0]); }, [modelId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { setEstimate(null); }, [input, attachments, modelId, mode, effort, budget, maxTok, sysPrompt]);

  useEffect(() => {
    const est = (t) => Math.ceil((t || "").split(/\s+/).filter(Boolean).length * 1.3);
    const histToks = messages.reduce((acc, m) => acc + est(m.text), 0);
    setCtxTokens({ sys: est(sysPrompt), history: histToks, last: est(input) });
  }, [sysPrompt, messages, input]);

  const buildUserContent = (text) => {
    if (attachments.length === 0) return text;
    const blocks = attachments.map(attachmentToContentBlock);
    if (text.trim()) blocks.push({ type: "text", text: text.trim() });
    return blocks;
  };

  const buildBody = (history, withMax = false) => {
    const body = { model: modelId, messages: history };
    if (withMax) body.max_tokens = maxTok;
    if (sysPrompt.trim()) body.system = sysPrompt.trim();
    if (mode === "extended")                { body.thinking = { type: "enabled", budget_tokens: safeBudget }; }
    else if (mode === "adaptive")           { body.thinking = { type: "adaptive" }; }
    else if (mode === "off" && caps.effort) { body.effort = effort; }
    return body;
  };

  const getHistory = () => [
    ...messages.map(m => ({ role: m.role, content: m.content || m.text })),
    { role: "user", content: buildUserContent(input) },
  ];

  const countTokens = async () => {
    if (!input.trim() && attachments.length === 0) return;
    setCounting(true); setError(null);
    try {
      const res  = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST", headers: apiHeaders(apiKey),
        body: JSON.stringify(buildBody(getHistory())),
      });
      const data = await res.json();
      if (data.error) { setError(data.error.message); setCounting(false); return; }
      const inputTok  = data.input_tokens || 0;
      const likelyOut = Math.min(Math.round(maxTok * 0.25), maxTok);
      const minOut    = Math.min(150, maxTok);
      const thinkMax  = mode === "extended" ? safeBudget : mode === "adaptive" ? Math.round(maxTok * 0.4) : 0;
      setEstimate({ inputTok, minOut, likelyOut, maxOut: maxTok, thinkMax, thinkFrac: thinkMax / Math.max(maxTok, 1) });
    } catch (e) { setError(e.message); }
    setCounting(false);
  };

  const executeSend = async () => {
    const txt = input.trim();
    if (!txt && attachments.length === 0) return;
    if (loading) return;
    const estIn = estimate?.inputTok;
    const history = getHistory();
    const userContent = buildUserContent(txt);
    const attNames = attachments.map(a => a.name);
    setInput(""); setAttachments([]); setEstimate(null); setError(null);
    setMessages(prev => [...prev, { role: "user", text: txt, content: userContent, attachments: attNames }]);
    setLoading(true);
    try {
      const res  = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: apiHeaders(apiKey),
        body: JSON.stringify(buildBody(history, true)),
      });
      const data = await res.json();
      if (data.error) { setError(data.error.message); setLoading(false); return; }
      let thinkTxt = "", respTxt = "";
      for (const blk of (data.content || [])) {
        if (blk.type === "thinking") thinkTxt += (blk.thinking || blk.summary || "");
        else if (blk.type === "text") respTxt += blk.text;
      }
      const u = data.usage || {};
      const inTok = u.input_tokens || 0, outTok = u.output_tokens || 0;
      const cost = calcCost(inTok, price.in) + calcCost(outTok, price.out);
      setTotal(p => ({ in: p.in + inTok, out: p.out + outTok, cost: p.cost + cost }));
      setMessages(prev => [...prev, {
        role: "assistant", text: respTxt, thinking: thinkTxt,
        usage: { in: inTok, out: outTok, cr: u.cache_read_input_tokens || 0, cost },
        meta: { mode, effort: mode !== "off" ? effort : null, budget: mode === "extended" ? safeBudget : null },
        estimatedIn: estIn,
      }]);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleFiles = async (files) => {
    setProcessing(true); setError(null);
    try {
      const processed = await Promise.all(Array.from(files).map(processFile));
      setAttachments(prev => [...prev, ...processed]);
    } catch (e) { setError(`File error: ${e.message}`); }
    setProcessing(false);
  };

  const onDrop = (e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); };
  const onKey  = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); countTokens(); } };
  const clear  = () => { setMessages([]); setTotal({ in:0, out:0, cost:0 }); setExpanded({}); setError(null); setEstimate(null); setAttachments([]); };

  const estLikely = estimate ? calcCost(estimate.inputTok, price.in) + calcCost(estimate.likelyOut + estimate.thinkMax * 0.3, price.out) : 0;
  const estMax    = estimate ? calcCost(estimate.inputTok, price.in) + calcCost(estimate.maxOut + estimate.thinkMax, price.out) : 0;
  const modelLabel = (m) => { const p = getPrice(m.id); return `${m.display_name || m.id}  ·  $${p.in}/$${p.out}`; };
  const canSend = input.trim().length > 0 || attachments.length > 0;
  const lastMsgCost = messages.length > 0 ? (messages[messages.length - 1]?.usage?.cost || total.cost / Math.max(messages.filter(m=>m.role==="assistant").length, 1)) : 0;

  // Thinking mode tooltip copy
  const thinkTips = {
    off:      "No extended thinking — effort level controls reasoning depth",
    extended: "Fixed token budget for thinking — set the budget below",
    adaptive: "Claude decides when and how much to think per message",
  };
  const effortTips = {
    low:    "Fastest, cheapest — light reasoning",
    medium: "Balanced speed and depth",
    high:   "Deeper reasoning, slower response",
    max:    "Maximum effort — slowest, most thorough",
  };

  if (!apiKey) return <ApiKeyScreen onSave={setApiKey} />;

  return (
    <div style={{ fontFamily: T.sans, display: "flex", flexDirection: "column", height: "100vh", background: T.bg0, color: T.onDark, overflow: "hidden" }}
      onDragOver={e => e.preventDefault()} onDrop={onDrop}>

      {/* CONFIG */}
      <div style={{ background: T.bg1, borderBottom: `1px solid ${T.hairline}`, padding: "13px 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 11 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lbl>Model</Lbl>
            {modelsLoading
              ? <span style={{ fontSize: 12, color: T.muted }}>loading…</span>
              : <Tooltip tip="Select Claude model — price shown as $in/$out per million tokens" pos="bottom">
                  <select value={modelId} onChange={e => setModelId(e.target.value)} style={{ fontFamily: T.sans, fontSize: 15, background: T.bg3, color: T.onDark, border: `1px solid ${T.hairline2}`, borderRadius: 8, padding: "6px 11px", maxWidth: 300 }}>
                    {models.map(m => <option key={m.id} value={m.id}>{modelLabel(m)}</option>)}
                  </select>
                </Tooltip>
            }
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lbl>Think</Lbl>
            <div style={{ display: "flex", gap: 4 }}>
              {caps.modes.map(m => (
                <Tooltip key={m} tip={thinkTips[m] || m} pos="bottom">
                  <Pill active={mode === m} color="coral" onClick={() => setMode(m)}>{m}</Pill>
                </Tooltip>
              ))}
            </div>
          </div>

          {(mode === "adaptive" || (mode === "off" && caps.effort)) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Lbl>Effort</Lbl>
              <div style={{ display: "flex", gap: 4 }}>
                {EFFORTS.map(e => (
                  <Tooltip key={e} tip={effortTips[e]} pos="bottom">
                    <Pill active={effort === e} color="coral" onClick={() => setEffort(e)}>{e}</Pill>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            {total.in > 0 && <>
              <Tooltip tip="Session totals — input ↓ and output ↑ tokens" pos="bottom">
                <span style={{ fontFamily: T.mono, fontSize: 14, color: T.onDarkSoft, cursor: "default" }}>{fmt(total.in)}↓ {fmt(total.out)}↑</span>
              </Tooltip>
              <Tooltip tip="Total session cost so far" pos="bottom">
                <span style={{ fontFamily: T.mono, fontSize: 15, color: T.coral, background: T.coralDim, border: `1px solid ${T.coralBorder}`, borderRadius: 8, padding: "4px 12px", fontWeight: 500, cursor: "default" }}>{fmtCost(total.cost)}</span>
              </Tooltip>
            </>}
            {messages.length > 0 &&
              <Tooltip tip="Clear all messages and reset session cost" pos="bottom">
                <button onClick={clear} style={{ fontFamily: T.sans, fontSize: 14, color: T.onDarkSoft, background: "transparent", border: `1px solid ${T.hairline}`, borderRadius: 8, padding: "5px 14px", cursor: "pointer" }}>clear</button>
              </Tooltip>
            }
            <Tooltip tip="View or forget your stored API key" pos="bottom">
              <button onClick={() => setShowKeyEdit(s => !s)} style={{ fontFamily: T.sans, fontSize: 14, color: showKeyEdit ? T.coral : T.muted, background: "transparent", border: `1px solid ${showKeyEdit ? T.coralBorder : T.hairline}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>api key</button>
            </Tooltip>
            <Tooltip tip="Open README documentation" pos="bottom">
              <a href="https://github.com/arielnishri-svg/token-estimator#readme" target="_blank" rel="noreferrer" style={{ fontFamily: T.sans, fontSize: 14, color: T.muted, textDecoration: "none", border: `1px solid ${T.hairline}`, borderRadius: 8, padding: "5px 12px", whiteSpace: "nowrap" }}>docs ↗</a>
            </Tooltip>
            <Tooltip tip="Download the claude.ai artifact version — no API key needed" pos="bottom">
              <a href="/snippet.txt" download="claude-token-estimator-snippet.txt" style={{ fontFamily: T.sans, fontSize: 14, color: T.onDarkSoft, textDecoration: "none", border: `1px solid ${T.hairline}`, borderRadius: 8, padding: "5px 12px", whiteSpace: "nowrap" }}>snippet ↓</a>
            </Tooltip>
          </div>
        </div>

        {showKeyEdit && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.muted }}>key: {apiKey.slice(0, 16)}…{apiKey.slice(-4)}</span>
            <Tooltip tip="Remove the API key from localStorage — you'll need to re-enter it" pos="bottom">
              <button onClick={forgetKey} style={{ fontFamily: T.sans, fontSize: 12, color: T.red, background: "transparent", border: `1px solid ${T.red}`, borderRadius: 8, padding: "3px 10px", cursor: "pointer" }}>forget key</button>
            </Tooltip>
            <button onClick={() => setShowKeyEdit(false)} style={{ fontFamily: T.sans, fontSize: 12, color: T.onDarkSoft, background: "transparent", border: `1px solid ${T.hairline}`, borderRadius: 8, padding: "3px 10px", cursor: "pointer" }}>done</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          {mode === "extended" && (
            <div style={{ display: "flex", gap: 9, alignItems: "center", flex: 1, minWidth: 160 }}>
              <Lbl>Think budget</Lbl>
              <Tooltip tip="Max tokens Claude can spend thinking — higher = deeper reasoning, higher cost ceiling" pos="bottom">
                <input type="range" min={1024} max={Math.min(32000, maxTok - 512)} step={512} value={budget}
                  onChange={e => setBudget(Number(e.target.value))} style={{ flex: 1, accentColor: T.coral }} />
              </Tooltip>
              <span style={{ fontFamily: T.mono, fontSize: 15, color: budget >= maxTok - 512 ? T.red : T.coral, minWidth: 52, textAlign: "right" }}>{fmt(budget)}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <Lbl>Max out</Lbl>
            <Tooltip tip="Maximum output tokens — caps response length and cost ceiling" pos="bottom">
              <input type="range" min={1024} max={32000} step={512} value={maxTok}
                onChange={e => setMaxTok(Number(e.target.value))} style={{ width: 90, accentColor: T.coral }} />
            </Tooltip>
            <span style={{ fontFamily: T.mono, fontSize: 15, color: T.onDark, minWidth: 52, textAlign: "right" }}>{fmt(maxTok)}</span>
          </div>
          {mode !== "off" && (
            <Tooltip tip="Display Claude's internal reasoning trace in the chat" pos="bottom">
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: T.sans, fontSize: 15, color: T.onDarkSoft, cursor: "pointer" }}>
                <input type="checkbox" checked={showThink} onChange={e => setShowThink(e.target.checked)} style={{ accentColor: T.coral }} /> show thinking
              </label>
            </Tooltip>
          )}
          <Tooltip tip="Add a system prompt — counts as input tokens on every message" pos="bottom">
            <button onClick={() => setShowSys(s => !s)} style={{ fontFamily: T.sans, fontSize: 14, color: showSys ? T.coral : T.onDarkSoft, background: "transparent", border: `1px solid ${showSys ? T.coralBorder : T.hairline}`, borderRadius: 8, padding: "5px 14px", cursor: "pointer" }}>sys prompt</button>
          </Tooltip>
          <Tooltip tip="Toggle insight panels: context window bar, cost projector, prompt optimizer, model router" pos="bottom">
            <button onClick={() => setShowPanels(s => !s)} style={{ fontFamily: T.sans, fontSize: 14, color: showPanels ? T.coral : T.onDarkSoft, background: showPanels ? T.coralDim : "transparent", border: `1px solid ${showPanels ? T.coralBorder : T.hairline}`, borderRadius: 8, padding: "5px 14px", cursor: "pointer" }}>insights ✦</button>
          </Tooltip>
        </div>

        {showSys && (
          <textarea value={sysPrompt} onChange={e => setSysPrompt(e.target.value)} placeholder="System prompt…"
            style={{ width: "100%", marginTop: 10, fontFamily: T.sans, fontSize: 13, padding: "9px 12px", minHeight: 54, resize: "vertical", background: T.bg0, color: T.onDark, border: `1px solid ${T.hairline2}`, borderRadius: 8, boxSizing: "border-box" }} />
        )}
      </div>

      {/* CONTEXT WINDOW BAR */}
      <ContextBar sysTokens={ctxTokens.sys} historyTokens={ctxTokens.history} lastTokens={ctxTokens.last} />

      {/* MESSAGES */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 10px", display: "flex", flexDirection: "column", gap: 18 }}>
        {messages.length === 0 && !loading && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 }}>
            <div style={{ fontFamily: T.serif, fontSize: 32, fontWeight: 400, color: T.onDark, letterSpacing: "-0.5px" }}>Configure · Estimate · Send</div>
            <div style={{ fontSize: 13, color: T.muted }}>
              counts tokens before every burn · supports pdf, docx, images, txt ·{" "}
              <a href="https://claude.ai/new?q=Why+is+the+Anthropic+token+counting+API+free+to+use%3F+Explain+in+simple+terms." target="_blank" rel="noreferrer" style={{ color: T.coral, textDecoration: "none" }}>estimating is free ↗</a>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "assistant" && msg.thinking && showThink && (
              <div style={{ marginBottom: 8 }}>
                <button onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: T.sans, fontSize: 11, fontWeight: 500, color: T.muted, background: "transparent", border: "none", cursor: "pointer", padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  <span style={{ fontSize: 9 }}>{expanded[i] ? "▼" : "▶"}</span> Thinking
                </button>
                {expanded[i] && (
                  <div style={{ fontFamily: T.mono, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.65, maxHeight: 170, overflowY: "auto", padding: "12px 14px", background: T.bg2, border: `1px solid ${T.hairline}`, borderRadius: 8, color: T.onDarkSoft, marginTop: 5 }}>
                    {msg.thinking}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.attachments?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {msg.attachments.map((name, j) => (
                    <div key={j} style={{ fontSize: 11, color: T.onDarkSoft, background: T.bg2, border: `1px solid ${T.hairline2}`, borderRadius: 6, padding: "3px 8px", fontFamily: T.sans }}>📎 {name}</div>
                  ))}
                </div>
              )}
              {msg.text && (
                <div style={{ maxWidth: "80%", padding: "12px 16px", borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px", background: msg.role === "user" ? T.bg2 : T.bg1, border: `1px solid ${msg.role === "user" ? T.hairline2 : T.hairline}`, fontFamily: T.sans, fontSize: 16, lineHeight: 1.7, color: T.onDark, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.text}
                </div>
              )}
            </div>

            {msg.role === "assistant" && msg.usage && (
              <div style={{ display: "flex", gap: 10, marginTop: 7, alignItems: "center", flexWrap: "wrap", paddingLeft: 2 }}>
                <Tooltip tip="Input ↓ and output ↑ tokens for this message" pos="top">
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.onDarkSoft, cursor: "default" }}>↓{fmt(msg.usage.in)} ↑{fmt(msg.usage.out)}{msg.usage.cr > 0 ? ` cache:${fmt(msg.usage.cr)}` : ""}</span>
                </Tooltip>
                <Tooltip tip="Actual cost for this message" pos="top">
                  <span style={{ fontFamily: T.mono, fontSize: 13, color: T.coral, fontWeight: 500, cursor: "default" }}>{fmtCost(msg.usage.cost)}</span>
                </Tooltip>
                {msg.estimatedIn && (
                  <Tooltip tip="How close the pre-send estimate was to the actual token count" pos="top">
                    <span style={{ fontFamily: T.mono, fontSize: 12, color: Math.abs(msg.usage.in - msg.estimatedIn) > msg.estimatedIn * 0.1 ? T.red : T.green, cursor: "default" }}>
                      est {fmt(msg.estimatedIn)} → actual {fmt(msg.usage.in)} ({msg.usage.in > msg.estimatedIn ? "+" : ""}{fmt(msg.usage.in - msg.estimatedIn)})
                    </span>
                  </Tooltip>
                )}
                <Tooltip tip="Thinking mode and settings used for this message" pos="top">
                  <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 11, color: T.onDarkSoft, background: T.bg2, border: `1px solid ${T.hairline}`, borderRadius: 6, padding: "2px 8px", cursor: "default" }}>
                    {msg.meta.mode}{msg.meta.effort ? `·${msg.meta.effort}` : ""}{msg.meta.budget ? `·${fmt(msg.meta.budget)}tok` : ""}
                  </span>
                </Tooltip>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex" }}>
            <div style={{ fontFamily: T.sans, fontSize: 14, color: T.coral, padding: "11px 16px", background: T.coralDim, border: `1px solid ${T.coralBorder}`, borderRadius: 10 }}>burning tokens…</div>
          </div>
        )}
        {error && <div style={{ fontFamily: T.mono, fontSize: 13, color: T.red, padding: "10px 14px", background: T.redBg, border: `1px solid ${T.red}`, borderRadius: 8 }}>{error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* INSIGHT PANELS */}
      {showPanels && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "8px 16px", background: T.bg0, borderTop: `1px solid ${T.hairline}`, flexShrink: 0 }}>
          <CostProjector perMsgCost={lastMsgCost || calcCost(500, price.in) + calcCost(200, price.out)} models={models} lastMsgTokens={ctxTokens.last || 500} />
          <PromptOptimizer sysPrompt={sysPrompt} setSysPrompt={setSysPrompt} apiKey={apiKey} />
          <ModelRouter messages={messages} modelId={modelId} setModelId={setModelId} />
        </div>
      )}

      {/* ESTIMATE PANEL */}
      {estimate && (
        <div style={{ margin: "0 16px 0", background: T.bg1, border: `1px solid ${T.coralBorder}`, borderRadius: "10px 10px 0 0", padding: "16px 20px", borderBottom: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 400, color: T.onDark, letterSpacing: "-0.3px" }}>Cost estimate — confirm to send</span>
            <Tooltip tip="Exact count from the token counting API (free call, not billed)" pos="top">
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.onDarkSoft, cursor: "default" }}>input: {fmt(estimate.inputTok)} tokens (exact)</span>
            </Tooltip>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>cost by model — same message</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(models.length, 4)}, 1fr)`, gap: 8 }}>
              {models.map(m => {
                const likely = crossCost(estimate.inputTok, estimate.likelyOut, estimate.thinkFrac, m.id);
                const max    = crossCost(estimate.inputTok, estimate.maxOut, estimate.thinkFrac * 1.5, m.id);
                const active = m.id === modelId;
                const p      = getPrice(m.id);
                const name   = (m.display_name || m.id).replace("Claude ", "");
                return (
                  <Tooltip key={m.id} tip={active ? "Currently selected — click another card to switch" : "Click to switch to this model before sending"} pos="top">
                    <div onClick={() => setModelId(m.id)} style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: active ? T.coralDim : T.bg2, border: `1px solid ${active ? T.coralBorder : T.hairline2}`, transition: "all 0.12s", width: "100%" }}>
                      <div style={{ fontFamily: T.sans, fontSize: 12, color: active ? T.coral : T.onDarkSoft, marginBottom: 3, fontWeight: active ? 500 : 400 }}>{name}{active ? " ✓" : ""}</div>
                      <div style={{ fontFamily: T.serif, fontSize: 20, color: active ? T.coral : T.onDark }}>{fmtCost(likely)}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>up to {fmtCost(max)}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>${p.in}/${p.out}/MTok</div>
                    </div>
                  </Tooltip>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>click a card to switch model before sending</div>
          </div>

          <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              {(models.find(m => m.id === modelId)?.display_name || modelId).replace("Claude ", "")} breakdown
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px 18px" }}>
              {[
                { label: "Input",        val: fmtCost(calcCost(estimate.inputTok, price.in)),  note: `${fmt(estimate.inputTok)} tok`,    tip: "Exact input token count × input rate" },
                { label: "Out (min)",    val: fmtCost(calcCost(estimate.minOut, price.out)),    note: `~${fmt(estimate.minOut)} tok`,      tip: "Cost floor — assumes a very short reply" },
                { label: "Out (likely)", val: fmtCost(calcCost(estimate.likelyOut, price.out)), note: `~${fmt(estimate.likelyOut)} tok`,   tip: "25% of max_tokens — typical real-world output length" },
                estimate.thinkMax > 0
                  ? { label: "Think (max)", val: fmtCost(calcCost(estimate.thinkMax, price.out)), note: `≤${fmt(estimate.thinkMax)} tok`, tip: "Thinking tokens billed at output rate — actual usage may be lower" }
                  : { label: "Out (max)",   val: fmtCost(calcCost(estimate.maxOut, price.out)),  note: `${fmt(estimate.maxOut)} tok`,      tip: "Worst case — full max_tokens used" },
              ].map(({ label, val, note, tip }) => (
                <Tooltip key={label} tip={tip} pos="top">
                  <div style={{ cursor: "default" }}>
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontFamily: T.serif, fontSize: 18, color: T.onDark }}>{val}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 11, color: T.onDarkSoft, marginTop: 2 }}>{note}</div>
                  </div>
                </Tooltip>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 16, alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: T.onDarkSoft }}>Likely total:</span>
              <Tooltip tip="Input cost + likely output + ~30% of thinking budget" pos="top">
                <span style={{ fontFamily: T.serif, fontSize: 26, color: T.coral, cursor: "default" }}>{fmtCost(estLikely)}</span>
              </Tooltip>
              <Tooltip tip="Worst case: full max_tokens output + full thinking budget" pos="top">
                <span style={{ fontSize: 12, color: T.muted, cursor: "default" }}>ceiling: {fmtCost(estMax)}</span>
              </Tooltip>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Tooltip tip="Dismiss estimate — message stays in the input box" pos="top">
              <button onClick={() => setEstimate(null)} style={{ fontFamily: T.sans, fontSize: 13, padding: "8px 20px", borderRadius: 8, border: `1px solid ${T.hairline2}`, background: "transparent", color: T.onDarkSoft, cursor: "pointer" }}>cancel</button>
            </Tooltip>
            <Tooltip tip="Send the message now — this will be billed" pos="top">
              <button onClick={executeSend} style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 500, padding: "8px 24px", borderRadius: 8, border: "none", background: T.coral, color: T.onCoral, cursor: "pointer" }}>send it →</button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* INPUT */}
      <div style={{
        borderTop: `1px solid ${T.hairline}`,
        margin: estimate ? "0 16px 16px" : 0,
        border: estimate ? `1px solid ${T.coralBorder}` : undefined,
        borderRadius: estimate ? "0 0 10px 10px" : 0,
        padding: "12px 16px", background: T.bg1, flexShrink: 0,
      }}>
        {attachments.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {attachments.map((att, i) => (
              <AttachmentChip key={i} att={att} onRemove={() => setAttachments(prev => prev.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input ref={fileRef} type="file" accept={ACCEPTED} multiple onChange={e => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />

          <Tooltip tip="Attach file — PDF, DOCX, TXT, PNG, JPG, WebP · or drag & drop anywhere" pos="top">
            <button onClick={() => fileRef.current?.click()} disabled={processing} style={{
              background: "transparent", border: `1px solid ${T.hairline2}`, borderRadius: 8,
              width: 42, height: 42, flexShrink: 0, cursor: processing ? "wait" : "pointer",
              color: attachments.length > 0 ? T.coral : T.onDarkSoft, fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center", opacity: processing ? 0.5 : 1,
            }}>
              {processing ? "⏳" : "📎"}
            </button>
          </Tooltip>

          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
            disabled={loading || counting}
            placeholder={attachments.length > 0 ? "add a message (optional)…" : "message… enter to estimate · or attach a file"}
            rows={1} style={{ flex: 1, resize: "none", fontFamily: T.sans, fontSize: 16, padding: "10px 13px", borderRadius: 8, border: `1px solid ${T.hairline2}`, background: T.bg0, color: T.onDark, lineHeight: 1.6, minHeight: 42 }} />

          {!estimate && (
            <Tooltip tip="Count exact input tokens (free API call) and show cost breakdown before sending" pos="top">
              <button onClick={countTokens} disabled={loading || counting || !canSend} style={{
                fontFamily: T.sans, fontSize: 15, fontWeight: 500, padding: "10px 22px", height: 44, flexShrink: 0,
                borderRadius: 8, border: "none", background: T.coral, color: T.onCoral,
                cursor: (loading || counting || !canSend) ? "not-allowed" : "pointer",
                transition: "all 0.12s", opacity: (loading || counting || !canSend) ? 0.4 : 1,
              }}>
                {counting ? "counting…" : "estimate"}
              </button>
            </Tooltip>
          )}
        </div>

        <div style={{ marginTop: 6, fontSize: 11, color: T.muted, paddingLeft: 2 }}>
          supports pdf, docx, txt, png, jpg, webp · drag & drop anywhere
        </div>
      </div>
    </div>
  );
}
