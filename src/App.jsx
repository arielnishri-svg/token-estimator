import { useState, useRef, useEffect } from "react";

const injectFonts = () => {
  if (document.getElementById("cc-fonts")) return;
  const s = document.createElement("style");
  s.id = "cc-fonts";
  s.textContent = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap');`;
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

const LS_KEY = "claude_estimator_api_key";

const lookup  = (table, id) => table.find(r => id.toLowerCase().includes(r.match));
const getPrice = (id) => lookup(PRICING, id) || { in: 3.00, out: 15.00 };
const getCaps  = (id) => lookup(CAPS, id)    || { effort: true, adaptive: true, modes: ["off","extended","adaptive"] };

const EFFORTS = ["low","medium","high","max"];

const T = {
  bg0:"#060606", bg1:"#0e0e0e", bg2:"#181818", bg3:"#222",
  border:"#303030", border2:"#444",
  amber:"#fcd34d", amberDim:"#78350f", amberBg:"rgba(252,211,77,0.08)", amberBg2:"rgba(252,211,77,0.16)",
  green:"#6ee7b7", greenBg:"rgba(110,231,183,0.09)",
  red:"#fca5a5", redBg:"rgba(252,165,165,0.09)",
  blue:"#93c5fd", blueBg:"rgba(147,197,253,0.09)",
  txt0:"#ffffff", txt1:"#ffffff", txt2:"#e0e0e0", txt3:"#b0b0b0",
  font:"'Outfit', sans-serif", mono:"'JetBrains Mono', monospace",
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

function Pill({ active, color = "subtle", onClick, children, disabled }) {
  const C = {
    amber:  { bg: T.amberBg2, border: T.amber,   text: T.amber  },
    green:  { bg: T.greenBg,  border: T.green,   text: T.green  },
    blue:   { bg: T.blueBg,   border: T.blue,    text: T.blue   },
    red:    { bg: T.redBg,    border: T.red,      text: T.red   },
    subtle: { bg: T.bg3,      border: T.border2,  text: T.txt0  },
  };
  const c = C[color] || C.subtle;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: T.mono, fontSize: 13, padding: "5px 13px", borderRadius: 5,
      border: `1px solid ${active ? c.border : T.border}`,
      background: active ? c.bg : "transparent",
      color: active ? c.text : T.txt2,
      cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.12s", opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}

function Lbl({ children }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 11, color: T.txt2,
      textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// ── API Key Gate ──────────────────────────────────────────────────────────────
function ApiKeyScreen({ onSave }) {
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    const key = val.trim();
    if (!key) return;
    setTesting(true); setErr(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: apiHeaders(key),
      });
      const data = await res.json();
      if (data.error) { setErr(data.error.message); }
      else { localStorage.setItem(LS_KEY, key); onSave(key); }
    } catch (e) { setErr(e.message); }
    setTesting(false);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100vh", background: T.bg0, fontFamily: T.font, gap: 24, padding: 24,
    }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: T.mono, fontSize: 20, color: T.amber, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>
          ⚡ CLAUDE TOKEN ESTIMATOR
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 13, color: T.txt3 }}>
          counts tokens and estimates cost before every API call
        </div>
      </div>

      <div style={{
        width: "100%", maxWidth: 420, background: T.bg2,
        border: `1px solid ${T.border2}`, borderRadius: 10, padding: 28,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: 12, color: T.txt2, marginBottom: 12 }}>
          ANTHROPIC API KEY
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type={show ? "text" : "password"}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && test()}
            placeholder="sk-ant-..."
            style={{
              flex: 1, fontFamily: T.mono, fontSize: 13, padding: "10px 12px",
              background: T.bg0, color: T.txt0, border: `1px solid ${T.border2}`,
              borderRadius: 5, outline: "none",
            }}
          />
          <button onClick={() => setShow(s => !s)} style={{
            fontFamily: T.mono, fontSize: 12, color: T.txt2,
            background: "transparent", border: `1px solid ${T.border2}`,
            borderRadius: 5, padding: "0 12px", cursor: "pointer",
          }}>{show ? "hide" : "show"}</button>
        </div>

        {err && (
          <div style={{ fontFamily: T.mono, fontSize: 12, color: T.red, marginBottom: 10 }}>{err}</div>
        )}

        <button onClick={test} disabled={testing || !val.trim()} style={{
          width: "100%", fontFamily: T.mono, fontSize: 13, padding: "10px",
          borderRadius: 5, border: `1px solid ${T.amber}`,
          background: T.amberBg2, color: T.amber,
          cursor: testing || !val.trim() ? "not-allowed" : "pointer",
          fontWeight: 700, opacity: testing || !val.trim() ? 0.5 : 1,
          transition: "all 0.12s",
        }}>
          {testing ? "verifying…" : "save & connect →"}
        </button>

        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.txt3, marginTop: 14, lineHeight: 1.7 }}>
          Your key is stored only in your browser's localStorage. It is never sent anywhere except directly to api.anthropic.com.
          Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
            style={{ color: T.amber }}>console.anthropic.com</a>.
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => { injectFonts(); }, []);

  const [apiKey, setApiKey]         = useState(() => localStorage.getItem(LS_KEY) || "");
  const [models, setModels]         = useState([]);
  const [modelsLoading, setML]      = useState(false);
  const [modelId, setModelId]       = useState("claude-sonnet-4-6");
  const [mode, setMode]             = useState("adaptive");
  const [effort, setEffort]         = useState("medium");
  const [budget, setBudget]         = useState(8000);
  const [maxTok, setMaxTok]         = useState(16000);
  const [showThink, setShowThink]   = useState(true);
  const [sysPrompt, setSysPrompt]   = useState("");
  const [showSys, setShowSys]       = useState(false);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [counting, setCounting]     = useState(false);
  const [error, setError]           = useState(null);
  const [total, setTotal]           = useState({ in: 0, out: 0, cost: 0 });
  const [expanded, setExpanded]     = useState({});
  const [estimate, setEstimate]     = useState(null);
  const [showKeyEdit, setShowKeyEdit] = useState(false);
  const bottomRef = useRef(null);

  const loadModels = (key) => {
    setML(true);
    fetch("https://api.anthropic.com/v1/models", { headers: apiHeaders(key) })
      .then(r => r.json())
      .then(data => {
        const list = (data.data || [])
          .filter(m => m.id.startsWith("claude-"))
          .sort((a, b) => {
            const tier = id => id.includes("opus") ? 0 : id.includes("sonnet") ? 1 : 2;
            const td = tier(a.id) - tier(b.id);
            return td !== 0 ? td : b.id.localeCompare(a.id);
          });
        setModels(list.length > 0 ? list : FALLBACK_MODELS);
        const def = list.find(m => m.id.includes("sonnet")) || list[0];
        if (def) setModelId(def.id);
      })
      .catch(() => setModels(FALLBACK_MODELS))
      .finally(() => setML(false));
  };

  useEffect(() => { if (apiKey) loadModels(apiKey); }, [apiKey]);

  const handleKeySave = (key) => { setApiKey(key); };
  const forgetKey = () => { localStorage.removeItem(LS_KEY); setApiKey(""); setModels([]); };

  const caps       = getCaps(modelId);
  const price      = getPrice(modelId);
  const safeBudget = Math.min(budget, maxTok - 512);

  useEffect(() => { if (!caps.modes.includes(mode)) setMode(caps.modes[0]); }, [modelId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { setEstimate(null); }, [input, modelId, mode, effort, budget, maxTok, sysPrompt]);

  const buildBody = (history, withMax = false) => {
    const body = { model: modelId, messages: history };
    if (withMax) body.max_tokens = maxTok;
    if (sysPrompt.trim()) body.system = sysPrompt.trim();
    if (mode === "extended")                { body.thinking = { type: "enabled", budget_tokens: safeBudget }; }
    else if (mode === "adaptive")           { body.thinking = { type: "adaptive" }; body.effort = effort; }
    else if (mode === "off" && caps.effort) { body.effort = effort; }
    return body;
  };

  const getHistory = () => [
    ...messages.map(m => ({ role: m.role, content: m.text })),
    { role: "user", content: input.trim() },
  ];

  const countTokens = async () => {
    if (!input.trim()) return;
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
    if (!txt || loading) return;
    const estIn = estimate?.inputTok;
    const history = getHistory();
    setInput(""); setEstimate(null); setError(null);
    setMessages(prev => [...prev, { role: "user", text: txt }]);
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

  const onKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); estimate ? executeSend() : countTokens(); } };
  const clear = () => { setMessages([]); setTotal({ in: 0, out: 0, cost: 0 }); setExpanded({}); setError(null); setEstimate(null); };
  const effortColor = { low: "green", medium: "blue", high: "amber", max: "red" };

  const estLikely = estimate ? calcCost(estimate.inputTok, price.in) + calcCost(estimate.likelyOut + estimate.thinkMax * 0.3, price.out) : 0;
  const estMax    = estimate ? calcCost(estimate.inputTok, price.in) + calcCost(estimate.maxOut + estimate.thinkMax, price.out) : 0;

  const modelLabel = (m) => {
    const name = m.display_name || m.id;
    const p = getPrice(m.id);
    return `${name}  ·  $${p.in}/$${p.out}`;
  };

  if (!apiKey) return <ApiKeyScreen onSave={handleKeySave} />;

  return (
    <div style={{
      fontFamily: T.font, display: "flex", flexDirection: "column",
      height: "100vh", background: T.bg0, color: T.txt0, overflow: "hidden",
    }}>

      {/* CONFIG */}
      <div style={{ background: T.bg1, borderBottom: `1px solid ${T.border}`, padding: "13px 18px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 11 }}>

          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <Lbl>model</Lbl>
            {modelsLoading
              ? <span style={{ fontFamily: T.mono, fontSize: 12, color: T.txt2 }}>loading…</span>
              : <select value={modelId} onChange={e => setModelId(e.target.value)} style={{
                  fontFamily: T.mono, fontSize: 12, background: T.bg3, color: T.txt0,
                  border: `1px solid ${T.border2}`, borderRadius: 5, padding: "5px 9px", maxWidth: 280,
                }}>
                  {models.map(m => <option key={m.id} value={m.id}>{modelLabel(m)}</option>)}
                </select>
            }
          </div>

          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <Lbl>think</Lbl>
            <div style={{ display: "flex", gap: 5 }}>
              {caps.modes.map(m => <Pill key={m} active={mode === m} color="amber" onClick={() => setMode(m)}>{m}</Pill>)}
            </div>
          </div>

          {(mode === "adaptive" || (mode === "off" && caps.effort)) && (
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <Lbl>effort</Lbl>
              <div style={{ display: "flex", gap: 5 }}>
                {EFFORTS.map(e => <Pill key={e} active={effort === e} color={effortColor[e]} onClick={() => setEffort(e)}>{e}</Pill>)}
              </div>
            </div>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            {total.in > 0 && <>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.txt2 }}>{fmt(total.in)}↓ {fmt(total.out)}↑</span>
              <span style={{ fontFamily: T.mono, fontSize: 13, color: T.amber, background: T.amberBg, border: `1px solid ${T.amberDim}`, borderRadius: 5, padding: "3px 10px", fontWeight: 600 }}>
                {fmtCost(total.cost)}
              </span>
            </>}
            {messages.length > 0 && (
              <button onClick={clear} style={{ fontFamily: T.mono, fontSize: 12, color: T.txt2, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 5, padding: "4px 12px", cursor: "pointer" }}>clear</button>
            )}
            <button onClick={() => setShowKeyEdit(s => !s)} style={{
              fontFamily: T.mono, fontSize: 12, color: showKeyEdit ? T.amber : T.txt3,
              background: "transparent", border: `1px solid ${showKeyEdit ? T.amber : T.border}`,
              borderRadius: 5, padding: "4px 10px", cursor: "pointer",
            }}>api key</button>
          </div>
        </div>

        {/* Key edit inline */}
        {showKeyEdit && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.txt3 }}>
              key: {apiKey.slice(0, 16)}…{apiKey.slice(-4)}
            </span>
            <button onClick={forgetKey} style={{
              fontFamily: T.mono, fontSize: 12, color: T.red, background: "transparent",
              border: `1px solid ${T.red}`, borderRadius: 5, padding: "3px 10px", cursor: "pointer",
            }}>forget key</button>
            <button onClick={() => setShowKeyEdit(false)} style={{
              fontFamily: T.mono, fontSize: 12, color: T.txt2, background: "transparent",
              border: `1px solid ${T.border}`, borderRadius: 5, padding: "3px 10px", cursor: "pointer",
            }}>done</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          {mode === "extended" && (
            <div style={{ display: "flex", gap: 9, alignItems: "center", flex: 1, minWidth: 160 }}>
              <Lbl>think budget</Lbl>
              <input type="range" min={1024} max={Math.min(32000, maxTok - 512)} step={512} value={budget}
                onChange={e => setBudget(Number(e.target.value))} style={{ flex: 1, accentColor: T.amber }} />
              <span style={{ fontFamily: T.mono, fontSize: 13, color: budget >= maxTok - 512 ? T.red : T.amber, minWidth: 52, textAlign: "right" }}>{fmt(budget)}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <Lbl>max out</Lbl>
            <input type="range" min={1024} max={32000} step={512} value={maxTok}
              onChange={e => setMaxTok(Number(e.target.value))} style={{ width: 90, accentColor: T.amber }} />
            <span style={{ fontFamily: T.mono, fontSize: 13, color: T.txt1, minWidth: 52, textAlign: "right" }}>{fmt(maxTok)}</span>
          </div>
          {mode !== "off" && (
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: T.mono, fontSize: 12, color: T.txt2, cursor: "pointer" }}>
              <input type="checkbox" checked={showThink} onChange={e => setShowThink(e.target.checked)} style={{ accentColor: T.amber }} />
              show thinking
            </label>
          )}
          <button onClick={() => setShowSys(s => !s)} style={{
            fontFamily: T.mono, fontSize: 12, color: showSys ? T.amber : T.txt2,
            background: "transparent", border: `1px solid ${showSys ? T.amber : T.border}`,
            borderRadius: 5, padding: "4px 12px", cursor: "pointer",
          }}>sys prompt</button>
        </div>

        {showSys && (
          <textarea value={sysPrompt} onChange={e => setSysPrompt(e.target.value)} placeholder="System prompt…"
            style={{
              width: "100%", marginTop: 10, fontFamily: T.mono, fontSize: 13, padding: "9px 12px",
              minHeight: 54, resize: "vertical", background: T.bg0, color: T.txt0,
              border: `1px solid ${T.border2}`, borderRadius: 5, boxSizing: "border-box",
            }} />
        )}
      </div>

      {/* MESSAGES */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 10px", display: "flex", flexDirection: "column", gap: 18 }}>
        {messages.length === 0 && !loading && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 80 }}>
            <div style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: "0.15em", color: T.txt2 }}>CONFIGURE · ESTIMATE · SEND</div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.txt3 }}>counts tokens before every burn</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "assistant" && msg.thinking && showThink && (
              <div style={{ marginBottom: 8 }}>
                <button onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
                  style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: T.mono, fontSize: 12, color: T.txt2, background: "transparent", border: "none", cursor: "pointer", padding: "2px 0" }}>
                  <span style={{ fontSize: 10 }}>{expanded[i] ? "▼" : "▶"}</span> THINKING
                </button>
                {expanded[i] && (
                  <div style={{
                    fontFamily: T.mono, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.65,
                    maxHeight: 170, overflowY: "auto", padding: "12px 14px",
                    background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 5, color: T.txt2, marginTop: 5,
                  }}>
                    {msg.thinking}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "85%", padding: "12px 16px",
                borderRadius: msg.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                background: msg.role === "user" ? T.bg3 : T.bg2,
                border: `1px solid ${msg.role === "user" ? T.border2 : T.border}`,
                fontFamily: T.font, fontSize: 15, lineHeight: 1.8, color: T.txt0,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{msg.text}</div>
            </div>

            {msg.role === "assistant" && msg.usage && (
              <div style={{ display: "flex", gap: 12, marginTop: 7, alignItems: "center", flexWrap: "wrap", paddingLeft: 2 }}>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.txt2 }}>
                  ↓{fmt(msg.usage.in)} ↑{fmt(msg.usage.out)}{msg.usage.cr > 0 ? ` cache:${fmt(msg.usage.cr)}` : ""}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 13, color: T.amber, fontWeight: 600 }}>{fmtCost(msg.usage.cost)}</span>
                {msg.estimatedIn && (
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: Math.abs(msg.usage.in - msg.estimatedIn) > msg.estimatedIn * 0.1 ? T.red : T.green }}>
                    est {fmt(msg.estimatedIn)} → actual {fmt(msg.usage.in)} ({msg.usage.in > msg.estimatedIn ? "+" : ""}{fmt(msg.usage.in - msg.estimatedIn)})
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 11, color: T.txt2, background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 8px" }}>
                  {msg.meta.mode}{msg.meta.effort ? `·${msg.meta.effort}` : ""}{msg.meta.budget ? `·${fmt(msg.meta.budget)}tok` : ""}
                </span>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex" }}>
            <div style={{ fontFamily: T.mono, fontSize: 14, color: T.amber, padding: "11px 16px", background: T.amberBg, border: `1px solid ${T.amberDim}`, borderRadius: 8, letterSpacing: "0.05em" }}>
              burning tokens…
            </div>
          </div>
        )}
        {error && (
          <div style={{ fontFamily: T.mono, fontSize: 13, color: T.red, padding: "10px 14px", background: T.redBg, border: `1px solid ${T.red}`, borderRadius: 5 }}>{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ESTIMATE PANEL */}
      {estimate && (
        <div style={{ margin: "0 14px 0", background: T.bg2, border: `1px solid ${T.amber}`, borderRadius: "8px 8px 0 0", padding: "16px 18px", borderBottom: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.amber, letterSpacing: "0.1em", fontWeight: 600 }}>⚡ COST ESTIMATE — CONFIRM TO SEND</span>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.txt2 }}>input: {fmt(estimate.inputTok)} tokens (exact)</span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.txt2, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>cost by model — same message</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(models.length, 4)}, 1fr)`, gap: 8 }}>
              {models.map(m => {
                const likely = crossCost(estimate.inputTok, estimate.likelyOut, estimate.thinkFrac, m.id);
                const max    = crossCost(estimate.inputTok, estimate.maxOut, estimate.thinkFrac * 1.5, m.id);
                const active = m.id === modelId;
                const p      = getPrice(m.id);
                const name   = (m.display_name || m.id).replace("Claude ", "");
                return (
                  <div key={m.id} onClick={() => setModelId(m.id)} style={{
                    padding: "11px 12px", borderRadius: 7, cursor: "pointer",
                    background: active ? T.amberBg2 : T.bg3,
                    border: `1px solid ${active ? T.amber : T.border2}`,
                    transition: "all 0.12s",
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: 12, color: active ? T.amber : T.txt1, marginBottom: 4, fontWeight: active ? 600 : 400 }}>{name}{active ? " ✓" : ""}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 15, color: active ? T.amber : T.txt0, fontWeight: 700 }}>{fmtCost(likely)}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.txt3, marginTop: 3 }}>up to {fmtCost(max)}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.txt3, marginTop: 2 }}>${p.in}/${p.out}/MTok</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.txt2, marginTop: 6 }}>click a card to switch model before sending</div>
          </div>

          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.txt2, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              {(models.find(m => m.id === modelId)?.display_name || modelId).replace("Claude ", "")} breakdown
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px 18px" }}>
              {[
                { label: "Input",        val: fmtCost(calcCost(estimate.inputTok, price.in)),  note: `${fmt(estimate.inputTok)} tok` },
                { label: "Out (min)",    val: fmtCost(calcCost(estimate.minOut, price.out)),    note: `~${fmt(estimate.minOut)} tok` },
                { label: "Out (likely)", val: fmtCost(calcCost(estimate.likelyOut, price.out)), note: `~${fmt(estimate.likelyOut)} tok` },
                estimate.thinkMax > 0
                  ? { label: "Think (max)", val: fmtCost(calcCost(estimate.thinkMax, price.out)), note: `≤${fmt(estimate.thinkMax)} tok` }
                  : { label: "Out (max)",   val: fmtCost(calcCost(estimate.maxOut, price.out)),  note: `${fmt(estimate.maxOut)} tok` },
              ].map(({ label, val, note }) => (
                <div key={label}>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.txt2, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 14, color: T.txt0, fontWeight: 600 }}>{val}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.txt2, marginTop: 2 }}>{note}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 18, alignItems: "baseline" }}>
              <span style={{ fontFamily: T.mono, fontSize: 13, color: T.txt2 }}>Likely total:</span>
              <span style={{ fontFamily: T.mono, fontSize: 17, color: T.amber, fontWeight: 700 }}>{fmtCost(estLikely)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.txt2 }}>ceiling: {fmtCost(estMax)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
            <button onClick={() => setEstimate(null)} style={{
              fontFamily: T.mono, fontSize: 13, padding: "7px 20px", borderRadius: 5,
              border: `1px solid ${T.border2}`, background: "transparent", color: T.txt1, cursor: "pointer",
            }}>cancel</button>
            <button onClick={executeSend} style={{
              fontFamily: T.mono, fontSize: 13, padding: "7px 24px", borderRadius: 5,
              border: `1px solid ${T.amber}`, background: T.amberBg2, color: T.amber,
              cursor: "pointer", fontWeight: 700, letterSpacing: "0.04em",
            }}>send it →</button>
          </div>
        </div>
      )}

      {/* INPUT */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        margin: estimate ? "0 14px 14px" : 0,
        border: estimate ? `1px solid ${T.amber}` : undefined,
        borderTop: estimate ? `1px solid ${T.border}` : `1px solid ${T.border}`,
        borderRadius: estimate ? "0 0 8px 8px" : 0,
        padding: "13px 18px", display: "flex", gap: 9, alignItems: "flex-end",
        background: T.bg1, flexShrink: 0,
      }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
          disabled={loading || counting}
          placeholder={estimate ? "edit message to reset estimate…" : "message… enter to estimate · then send"}
          rows={1} style={{
            flex: 1, resize: "none", fontFamily: T.font, fontSize: 15, padding: "10px 13px",
            borderRadius: 5, border: `1px solid ${T.border2}`, background: T.bg0,
            color: T.txt0, lineHeight: 1.6, minHeight: 42,
          }} />
        <button onClick={estimate ? executeSend : countTokens}
          disabled={loading || counting || !input.trim()} style={{
            fontFamily: T.mono, fontSize: 13, padding: "10px 20px", height: 44, flexShrink: 0,
            borderRadius: 5, border: `1px solid ${estimate ? T.amber : T.border2}`,
            background: estimate ? T.amberBg2 : T.bg3,
            color: estimate ? T.amber : T.txt1,
            cursor: (loading || counting || !input.trim()) ? "not-allowed" : "pointer",
            letterSpacing: "0.05em", transition: "all 0.12s",
            opacity: (loading || counting || !input.trim()) ? 0.4 : 1,
            fontWeight: estimate ? 700 : 400,
          }}>
          {counting ? "counting…" : estimate ? "send →" : "estimate"}
        </button>
      </div>
    </div>
  );
}
