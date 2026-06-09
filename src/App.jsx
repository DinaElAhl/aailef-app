import { useEffect, useState } from "react";
import {
  AXES,
  ERRORS,
  grade,
  computeScores,
  hasError,
  MODEL,
} from "./aailef.js";
import { evaluate } from "./api.js";

const KEY_STORAGE = "aailef_api_key";
const HIST_STORAGE = "aailef_history";

// ── Small presentational components ──────────────────────────────────────────

function RadarChart({ scores }) {
  const N = 10,
    cx = 120,
    cy = 120,
    R = 95;
  const pts = AXES.map((ax, i) => {
    const a = (2 * Math.PI * i) / N - Math.PI / 2,
      v = (scores[ax.id]?.score || 0) / 5;
    return {
      x: cx + R * v * Math.cos(a),
      y: cy + R * v * Math.sin(a),
      lx: cx + (R + 20) * Math.cos(a),
      ly: cy + (R + 20) * Math.sin(a),
      id: ax.id,
    };
  });
  const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox="0 0 240 240" style={{ width: "100%", maxWidth: 220 }}>
      {[1, 2, 3, 4, 5].map((l) => {
        const gp = AXES.map((_, i) => {
          const a = (2 * Math.PI * i) / N - Math.PI / 2,
            r = (R * l) / 5;
          return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        }).join(" ");
        return <polygon key={l} points={gp} fill="none" stroke="#CBD5E1" strokeWidth="0.7" />;
      })}
      {AXES.map((_, i) => {
        const a = (2 * Math.PI * i) / N - Math.PI / 2;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + R * Math.cos(a)}
            y2={cy + R * Math.sin(a)}
            stroke="#CBD5E1"
            strokeWidth="0.7"
          />
        );
      })}
      <polygon points={poly} fill="rgba(29,78,216,0.12)" stroke="#1D4ED8" strokeWidth="2" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#1D4ED8" />
      ))}
      {pts.map((p, i) => (
        <text
          key={i}
          x={p.lx}
          y={p.ly}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="8.5"
          fontWeight="bold"
          fill="#0F2A5E"
          fontFamily="Arial"
        >
          {p.id}
        </text>
      ))}
    </svg>
  );
}

function Bar({ score }) {
  const c = score >= 4 ? "#059669" : score >= 3 ? "#D97706" : "#DC2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 7, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${(score / 5) * 100}%`,
            height: "100%",
            background: c,
            borderRadius: 4,
            transition: "width .5s",
          }}
        />
      </div>
      <span style={{ fontWeight: "bold", color: c, fontSize: 13, minWidth: 20 }}>{score}</span>
    </div>
  );
}

// ── Export helpers ───────────────────────────────────────────────────────────

function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportEntryJSON(entry) {
  download(`aailef-${entry.id}.json`, JSON.stringify(entry, null, 2), "application/json");
}

function exportHistoryCSV(hist) {
  const header = [
    "id",
    "time",
    "system",
    "task",
    "register",
    "LQ",
    "TQ",
    "overall",
    ...AXES.map((a) => a.id),
    ...AXES.map((a) => `${a.id}_error`),
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = hist.map((h) => {
    const s = h.parsed.scores;
    return [
      h.id,
      h.time,
      h.sysName,
      h.task,
      h.reg,
      h.lq,
      h.tq,
      h.ov,
      ...AXES.map((a) => s[a.id]?.score ?? ""),
      ...AXES.map((a) => s[a.id]?.error ?? ""),
    ]
      .map(esc)
      .join(",");
  });
  // BOM so Excel opens the Arabic UTF-8 correctly.
  download("aailef-results.csv", "﻿" + [header.map(esc).join(","), ...rows].join("\n"), "text/csv");
}

// ── Main app ─────────────────────────────────────────────────────────────────

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [sysName, setSysName] = useState("");
  const [text, setText] = useState("");
  const [task, setTask] = useState("تلخيص طبي أكاديمي");
  const [reg, setReg] = useState("فصحى أكاديمية");
  const [deepReasoning, setDeepReasoning] = useState(true);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [hist, setHist] = useState([]);
  const [tab, setTab] = useState("eval");

  // Load persisted key + history once.
  useEffect(() => {
    try {
      const k = localStorage.getItem(KEY_STORAGE);
      if (k) setApiKey(k);
      const h = localStorage.getItem(HIST_STORAGE);
      if (h) setHist(JSON.parse(h));
    } catch {
      /* ignore storage errors */
    }
  }, []);

  // Persist key + history on change.
  useEffect(() => {
    try {
      localStorage.setItem(KEY_STORAGE, apiKey);
    } catch {
      /* ignore */
    }
  }, [apiKey]);
  useEffect(() => {
    try {
      localStorage.setItem(HIST_STORAGE, JSON.stringify(hist));
    } catch {
      /* ignore */
    }
  }, [hist]);

  async function run() {
    if (!apiKey.trim()) {
      setErr("أدخلي مفتاح Anthropic API في الإعدادات أولاً.");
      setTab("eval");
      return;
    }
    if (!text.trim()) {
      setErr("أدخلي النص أولاً.");
      return;
    }
    setLoading(true);
    setErr("");
    setRes(null);
    try {
      const parsed = await evaluate({ apiKey, text, task, reg, deepReasoning });
      const { lq, tq, overall } = computeScores(parsed.scores);
      const entry = {
        id: Date.now(),
        sysName: sysName || "نظام غير مسمى",
        task,
        reg,
        model: MODEL,
        preview: text.slice(0, 70) + (text.length > 70 ? "…" : ""),
        parsed,
        lq: lq.toFixed(2),
        tq: tq.toFixed(2),
        ov: overall.toFixed(2),
        time: new Date().toLocaleString("ar-EG"),
      };
      setRes(entry);
      setHist((h) => [entry, ...h].slice(0, 50));
    } catch (e) {
      setErr(e.message || "خطأ في التقييم — أعيدي المحاولة.");
    }
    setLoading(false);
  }

  const iS = {
    width: "100%",
    padding: "9px 13px",
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "Arial",
    direction: "rtl",
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  };
  const card = {
    background: "#fff",
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
    border: "1px solid #E2E8F0",
  };

  return (
    <div style={{ fontFamily: "Arial,sans-serif", direction: "rtl", background: "#F1F5F9", minHeight: "100vh" }}>
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg,#0F2A5E 0%,#1D4ED8 60%,#0E7490 100%)",
          color: "#fff",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 28 }}>🔬</span>
        <div>
          <div style={{ fontWeight: "bold", fontSize: 17 }}>أداة تقييم AAILEF</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Arabic AI Linguistic Evaluation Framework</div>
        </div>
        <div style={{ marginRight: "auto", fontSize: 12, opacity: 0.7, textAlign: "left" }}>
          AI-Powered • 10 Axes • Weighted Scoring
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "2px solid #E2E8F0", display: "flex", padding: "0 20px" }}>
        {[
          ["eval", "🔍 التقييم"],
          ["hist", "📋 السجل"],
          ["guide", "📖 الدليل"],
          ["settings", "⚙️ الإعدادات"],
        ].map(([k, v]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "11px 18px",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "Arial",
              fontWeight: tab === k ? "bold" : "normal",
              color: tab === k ? "#1D4ED8" : "#64748B",
              background: "none",
              borderBottom: tab === k ? "3px solid #1D4ED8" : "3px solid transparent",
              marginBottom: -2,
            }}
          >
            {v}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 860, margin: "0 auto" }}>
        {/* Key reminder banner */}
        {!apiKey.trim() && tab !== "settings" && (
          <div
            style={{
              ...card,
              background: "#FFFBEB",
              border: "1px solid #FCD34D",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 20 }}>🔑</span>
            <div style={{ fontSize: 13, color: "#92400E", flex: 1 }}>
              لتشغيل التقييم تحتاجين مفتاح Anthropic API. يُحفظ في متصفحك فقط ولا يُرسل لأي خادم.
            </div>
            <button
              onClick={() => setTab("settings")}
              style={{
                padding: "7px 14px",
                border: "none",
                borderRadius: 7,
                background: "#D97706",
                color: "#fff",
                fontWeight: "bold",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "Arial",
              }}
            >
              إضافة المفتاح
            </button>
          </div>
        )}

        {/* ── EVALUATE TAB ── */}
        {tab === "eval" && (
          <>
            <div style={card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: "#334155", marginBottom: 5 }}>اسم النظام</div>
                  <input
                    style={iS}
                    value={sysName}
                    onChange={(e) => setSysName(e.target.value)}
                    placeholder="مثال: GPT-4o"
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: "#334155", marginBottom: 5 }}>نوع المهمة</div>
                  <select style={iS} value={task} onChange={(e) => setTask(e.target.value)}>
                    {[
                      "تلخيص طبي أكاديمي",
                      "تلخيص طبي مبسط",
                      "إجابة على سؤال مريض",
                      "ترجمة مصطلح طبي",
                      "تمييز غموض دلالي",
                      "إعادة صياغة",
                    ].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: "#334155", marginBottom: 5 }}>السجل اللغوي</div>
                  <select style={iS} value={reg} onChange={(e) => setReg(e.target.value)}>
                    {["فصحى أكاديمية", "فصحى مبسطة", "عامية مصرية", "مختلط"].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: "bold", color: "#334155", marginBottom: 5 }}>
                النص المراد تقييمه (مخرج النظام الذكي)
              </div>
              <textarea
                style={{ ...iS, minHeight: 110, resize: "vertical" }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="الصقي هنا مخرج النظام الذكي..."
              />
              <div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", cursor: "pointer" }}>
                  <input type="checkbox" checked={deepReasoning} onChange={(e) => setDeepReasoning(e.target.checked)} />
                  تفكير معمّق (أدق لكنه أبطأ قليلاً)
                </label>
                <div style={{ fontSize: 11, color: "#94A3B8", marginRight: "auto" }}>{text.length} حرف</div>
              </div>
              {err && (
                <div
                  style={{
                    color: "#DC2626",
                    fontSize: 12,
                    margin: "8px 0",
                    padding: "8px 12px",
                    background: "#FEF2F2",
                    borderRadius: 6,
                  }}
                >
                  {err}
                </div>
              )}
              <button
                onClick={run}
                disabled={loading}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "12px",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: "bold",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "Arial",
                  background: loading ? "#94A3B8" : "linear-gradient(135deg,#1D4ED8,#0E7490)",
                  color: "#fff",
                }}
              >
                {loading ? "⏳  جاري التقييم بالذكاء الاصطناعي..." : "🔍  تقييم النص بإطار AAILEF"}
              </button>
            </div>

            {res &&
              (() => {
                const g = grade(parseFloat(res.ov));
                return (
                  <>
                    {/* Overall */}
                    <div
                      style={{
                        ...card,
                        background: g.bg,
                        border: `2px solid ${g.border}`,
                        textAlign: "center",
                        padding: "20px",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>
                        {res.sysName} — {res.time}
                      </div>
                      <div style={{ fontSize: 48, fontWeight: "bold", color: g.color, lineHeight: 1 }}>
                        {res.ov}
                        <span style={{ fontSize: 16 }}>/5</span>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: "bold", color: g.color, margin: "4px 0 12px" }}>{g.label}</div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 28, fontSize: 13 }}>
                        <span>
                          📊 جودة اللغة LQ: <strong style={{ color: g.color }}>{res.lq}/5</strong>
                        </span>
                        <span>
                          ✅ جودة المهمة TQ: <strong style={{ color: g.color }}>{res.tq}/5</strong>
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
                        <button
                          onClick={() => exportEntryJSON(res)}
                          style={{
                            padding: "7px 14px",
                            border: "1px solid #CBD5E1",
                            borderRadius: 7,
                            background: "#fff",
                            color: "#334155",
                            fontSize: 12,
                            fontWeight: "bold",
                            cursor: "pointer",
                            fontFamily: "Arial",
                          }}
                        >
                          ⬇️ تصدير JSON
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 14, marginBottom: 14 }}>
                      {/* Radar */}
                      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: "bold", color: "#0F2A5E", marginBottom: 8 }}>
                          🕸️ مخطط الرادار
                        </div>
                        <RadarChart scores={res.parsed.scores} />
                      </div>
                      {/* Summary + Recs */}
                      <div>
                        <div style={{ ...card, marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: "bold", color: "#0F2A5E", marginBottom: 8 }}>
                            📝 التقييم العام
                          </div>
                          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "#334155" }}>{res.parsed.summary}</p>
                        </div>
                        <div style={card}>
                          <div style={{ fontSize: 13, fontWeight: "bold", color: "#065F46", marginBottom: 8 }}>💡 التوصيات</div>
                          {res.parsed.recommendations?.map((r, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7, fontSize: 12 }}>
                              <span style={{ color: "#059669", fontWeight: "bold", minWidth: 16 }}>{i + 1}.</span>
                              <span style={{ color: "#334155" }}>{r}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Axes */}
                    <div style={card}>
                      <div style={{ fontSize: 14, fontWeight: "bold", color: "#0F2A5E", marginBottom: 14 }}>
                        📊 تفاصيل المحاور العشرة
                      </div>
                      {AXES.map((ax) => {
                        const s = res.parsed.scores[ax.id];
                        const sc = s?.score || 0,
                          g2 = grade(sc);
                        const flag = hasError(s?.error);
                        return (
                          <div
                            key={ax.id}
                            style={{
                              display: "flex",
                              gap: 12,
                              padding: "10px 0",
                              borderBottom: "1px solid #F1F5F9",
                              alignItems: "flex-start",
                            }}
                          >
                            <div style={{ minWidth: 48, textAlign: "center" }}>
                              <div style={{ fontWeight: "bold", fontSize: 13, color: "#0F2A5E" }}>{ax.id}</div>
                              <div
                                style={{
                                  background: g2.bg,
                                  color: g2.color,
                                  borderRadius: 6,
                                  padding: "1px 6px",
                                  fontSize: 11,
                                  fontWeight: "bold",
                                  marginTop: 2,
                                }}
                              >
                                {sc}/5
                              </div>
                              {ax.weight >= 2 && (
                                <div style={{ fontSize: 9, color: "#B45309", marginTop: 2 }}>×{ax.weight}</div>
                              )}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                <span style={{ fontWeight: "bold", fontSize: 13, color: "#1E293B" }}>{ax.name}</span>
                                <span style={{ fontSize: 10, color: "#94A3B8" }}>({ax.name_en})</span>
                              </div>
                              <Bar score={sc} />
                              <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{s?.reason}</div>
                              {flag && (
                                <span
                                  style={{
                                    background: "#FEE2E2",
                                    color: "#991B1B",
                                    borderRadius: 5,
                                    padding: "1px 7px",
                                    fontSize: 11,
                                    display: "inline-block",
                                    marginTop: 3,
                                  }}
                                >
                                  ⚠️ {s.error}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Errors */}
                    <div style={card}>
                      <div style={{ fontSize: 13, fontWeight: "bold", color: "#7F1D1D", marginBottom: 10 }}>
                        🔴 الأخطاء المكتشفة
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {ERRORS.map((e) => {
                          const found = Object.values(res.parsed.scores).some(
                            (s) => hasError(s?.error) && s.error.trim() === e.id
                          );
                          return (
                            <div
                              key={e.id}
                              style={{
                                padding: "5px 11px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: "bold",
                                background: found ? "#FEE2E2" : "#F1F5F9",
                                color: found ? "#991B1B" : "#94A3B8",
                                border: found ? "1px solid #FECACA" : "1px solid #E2E8F0",
                              }}
                            >
                              {e.id} {e.label} {found ? "✗" : "✓"}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "hist" && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: "bold", color: "#0F2A5E" }}>📋 سجل التقييمات ({hist.length})</div>
              {hist.length > 0 && (
                <div style={{ marginRight: "auto", display: "flex", gap: 8 }}>
                  <button
                    onClick={() => exportHistoryCSV(hist)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 7,
                      background: "#fff",
                      color: "#334155",
                      fontSize: 12,
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontFamily: "Arial",
                    }}
                  >
                    ⬇️ تصدير CSV
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("هل تريدين مسح كل السجل؟")) setHist([]);
                    }}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #FECACA",
                      borderRadius: 7,
                      background: "#fff",
                      color: "#DC2626",
                      fontSize: 12,
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontFamily: "Arial",
                    }}
                  >
                    🗑️ مسح
                  </button>
                </div>
              )}
            </div>
            {hist.length === 0 && (
              <div style={{ textAlign: "center", color: "#94A3B8", padding: "40px 0", fontSize: 14 }}>
                لا يوجد تقييمات بعد
              </div>
            )}
            {hist.map((h) => {
              const g = grade(parseFloat(h.ov));
              return (
                <div
                  key={h.id}
                  onClick={() => {
                    setRes(h);
                    setTab("eval");
                  }}
                  style={{
                    padding: "12px 0",
                    borderBottom: "1px solid #F1F5F9",
                    cursor: "pointer",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: "bold", fontSize: 14, color: "#0F2A5E" }}>{h.sysName}</span>
                      <span style={{ fontSize: 11, color: "#94A3B8", marginRight: 8 }}>{h.time}</span>
                    </div>
                    <div
                      style={{
                        background: g.bg,
                        color: g.color,
                        border: `1px solid ${g.border}`,
                        borderRadius: 6,
                        padding: "3px 10px",
                        fontSize: 13,
                        fontWeight: "bold",
                      }}
                    >
                      {h.ov}/5 — {g.label}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>
                    {h.task} | {h.reg}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{h.preview}</div>
                </div>
              );
            })}
            {hist.length > 1 && (
              <div style={{ marginTop: 16, padding: 14, background: "#F8FAFC", borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: "bold", color: "#334155", marginBottom: 10 }}>📊 مقارنة النتائج</div>
                {hist.map((h) => {
                  const g = grade(parseFloat(h.ov));
                  return (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ minWidth: 110, fontSize: 12, fontWeight: "bold", color: "#0F2A5E", textAlign: "right" }}>
                        {h.sysName}
                      </span>
                      <div style={{ flex: 1, height: 10, background: "#E2E8F0", borderRadius: 5, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${(parseFloat(h.ov) / 5) * 100}%`,
                            height: "100%",
                            background: g.color,
                            borderRadius: 5,
                            transition: "width .5s",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: "bold", color: g.color, minWidth: 36 }}>{h.ov}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── GUIDE TAB ── */}
        {tab === "guide" && (
          <>
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: "bold", color: "#0F2A5E", marginBottom: 12 }}>📖 كيفية الاستخدام</div>
              {[
                ["0️⃣", "أضيفي مفتاح API", "من تبويب الإعدادات (مرة واحدة، يُحفظ في متصفحك)"],
                ["1️⃣", "اختاري اسم النظام", "مثال: GPT-4o أو Claude أو Jais"],
                ["2️⃣", "حددي المهمة والسجل اللغوي", "مثال: تلخيص طبي أكاديمي بالفصحى"],
                ["3️⃣", "الصقي مخرج النظام", "النص الذي أنتجه النظام الذكي"],
                ["4️⃣", "اضغطي تقييم", "سيُقيّم Claude النص وفق المحاور العشرة"],
                ["5️⃣", "راجعي النتائج", "الرادار + درجة كل محور + التوصيات"],
                ["6️⃣", "كرّري وقارني وصدّري", "قارني الأنظمة في السجل وصدّري CSV لرسالتك"],
              ].map(([i, t, d]) => (
                <div key={t} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 18 }}>{i}</span>
                  <div>
                    <div style={{ fontWeight: "bold", fontSize: 13, color: "#0F2A5E" }}>{t}</div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: "bold", color: "#0F2A5E", marginBottom: 12 }}>
                ⚖️ المحاور العشرة وأوزانها
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {AXES.map((ax) => (
                  <div
                    key={ax.id}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      minWidth: 170,
                      background: ax.weight >= 2 ? "#FFF7ED" : ax.weight >= 1.5 ? "#EFF6FF" : "#F8FAFC",
                      border: ax.weight >= 2 ? "1px solid #FED7AA" : ax.weight >= 1.5 ? "1px solid #BFDBFE" : "1px solid #E2E8F0",
                    }}
                  >
                    <div style={{ fontWeight: "bold", color: "#0F2A5E" }}>
                      {ax.id} — {ax.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", margin: "3px 0" }}>{ax.desc}</div>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: ax.color }}>الثقل: ×{ax.weight}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...card, background: "#F0F7FF", border: "1px solid #BFDBFE" }}>
              <div style={{ fontSize: 13, fontWeight: "bold", color: "#1D4ED8", marginBottom: 8 }}>📐 معادلة الحساب</div>
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.9 }}>
                <div>
                  • <strong>LQ (جودة اللغة)</strong> = متوسط مُرجَّح لمحاور A1–A9
                </div>
                <div>
                  • <strong>TQ (جودة المهمة)</strong> = درجة A10 مباشرةً
                </div>
                <div>
                  • <strong>النتيجة الإجمالية</strong> = (0.7 × LQ) + (0.3 × TQ)
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <>
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: "bold", color: "#0F2A5E", marginBottom: 6 }}>🔑 مفتاح Anthropic API</div>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 1.7 }}>
                هذه أداة «أحضري مفتاحك». يُحفظ المفتاح في متصفحك فقط (localStorage) ويُرسَل مباشرةً إلى Anthropic ولا يمرّ بأي
                خادم وسيط. احصلي على مفتاح من{" "}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: "#1D4ED8" }}>
                  console.anthropic.com
                </a>
                .
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...iS, direction: "ltr", textAlign: "left", fontFamily: "monospace" }}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  style={{
                    padding: "0 14px",
                    border: "1px solid #CBD5E1",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: "pointer",
                    fontFamily: "Arial",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  {showKey ? "🙈 إخفاء" : "👁️ إظهار"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: "bold",
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: apiKey.trim() ? "#ECFDF5" : "#FEF2F2",
                    color: apiKey.trim() ? "#059669" : "#DC2626",
                  }}
                >
                  {apiKey.trim() ? "✓ المفتاح محفوظ" : "✗ لا يوجد مفتاح"}
                </span>
                {apiKey.trim() && (
                  <button
                    onClick={() => {
                      setApiKey("");
                      setShowKey(false);
                    }}
                    style={{
                      padding: "5px 12px",
                      border: "1px solid #FECACA",
                      borderRadius: 7,
                      background: "#fff",
                      color: "#DC2626",
                      fontSize: 12,
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontFamily: "Arial",
                    }}
                  >
                    حذف المفتاح
                  </button>
                )}
              </div>
            </div>

            <div style={{ ...card, fontSize: 12, color: "#64748B", lineHeight: 1.8 }}>
              <div style={{ fontSize: 13, fontWeight: "bold", color: "#0F2A5E", marginBottom: 6 }}>ℹ️ معلومات</div>
              <div>
                • النموذج المستخدم: <strong style={{ color: "#0F2A5E" }}>{MODEL}</strong> (الأدقّ لأحكام اللغة العربية).
              </div>
              <div>• «التفكير المعمّق» في تبويب التقييم يرفع الدقة مقابل زمن أطول قليلاً لكل تقييم.</div>
              <div>• يُحفظ سجلّ آخر 50 تقييماً في متصفحك ويمكن تصديره CSV/JSON.</div>
            </div>
          </>
        )}
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "#94A3B8", padding: "10px 0 24px" }}>
        AAILEF • أداة تقييم المخرجات اللغوية العربية للذكاء الاصطناعي • مفتوحة المصدر (MIT)
      </div>
    </div>
  );
}
