import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADES = [
  { id:"S", label:"頂級", sub:"Top Reserve",  min:88, color:"#a07828", light:"#fffaed", border:"#d4b04a", badge:"👑", pkg:"建議售價等級", price:"NT$6,000 以上 / 斤" },
  { id:"A", label:"精選", sub:"Premium",       min:76, color:"#3d6b50", light:"#eef7f1", border:"#6dab85", badge:"🌟", pkg:"建議售價等級", price:"NT$4,000 以上 / 斤" },
  { id:"B", label:"優選", sub:"Fine Grade",    min:62, color:"#2e5f80", light:"#edf4f9", border:"#5a97ba", badge:"⭐", pkg:"建議售價等級", price:"NT$3,000 以上 / 斤" },
  { id:"C", label:"標準", sub:"Standard",      min: 0, color:"#6b5a48", light:"#f5f1ec", border:"#a89480", badge:"🍃", pkg:"建議售價等級", price:"NT$3,000 以下 / 斤" },
];

const DIMS = [
  { key:"appearance", label:"外觀條索", w:10, hint:"芽葉完整、色澤鮮綠" },
  { key:"aroma_dry",  label:"乾　　香", w:15, hint:"清新花香、高山氣息" },
  { key:"aroma_wet",  label:"濕　　香", w:15, hint:"沖泡後揚香度" },
  { key:"liquor",     label:"湯　　色", w:10, hint:"金黃清澈、明亮度" },
  { key:"taste",      label:"滋　　味", w:20, hint:"醇厚鮮爽、協調性" },
  { key:"sweetness",  label:"回　　甘", w:15, hint:"甜潤持久、喉韻" },
  { key:"aftertaste", label:"韻　　味", w:15, hint:"餘韻綿長、山頭氣" },
];

const FLAVOR_TAGS = ["花香","蜜香","果香","清新","草香","奶香","高山氣","鮮爽","甘潤","醇厚","清雅","多層次","火味"];
const WEATHER_OPT = ["晴","多雲","清晨霧後晴","霧雨"];

// Pesticide tests
const PESTICIDE_ITEMS = [
  "撲滅寧","賽普洛","依普同","達馬松","益達胺","亞滅培","可尼丁","氟尼胺","百克敏","腐絕",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2,8);

function calcScore(dims) {
  let t = 0;
  for (const d of DIMS) t += (dims[d.key]||0)/10 * d.w;
  return Math.round(t);
}

function avgScoreOfBatch(batch) {
  const done = batch.judges.filter(j=>j.submitted);
  if (!done.length) return null;
  return Math.round(done.reduce((s,j)=>s+calcScore(j.dims),0)/done.length);
}

function getGrade(score) {
  return [...GRADES].sort((a,b)=>b.min-a.min).find(g=>score>=g.min)||GRADES[3];
}

function todayStr() {
  return new Date().toISOString().slice(0,10);
}

// Suggest blend ID from selected source batches
function suggestBlendId(sourceBatchNos) {
  if (!sourceBatchNos.length) return "";
  const parts = sourceBatchNos.map(no => {
    // Extract MMDD and suffix e.g. LS-0501-A → 0501A
    const m = no.match(/(\d{4})-([A-Z])/);
    if (m) return m[1]+m[2];
    return no.replace(/[^A-Z0-9]/gi,"").slice(-5);
  });
  return "BL-" + parts.join("+");
}

// ─── Firebase Firestore 雲端資料庫 ───────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyBR7f5SZzFKKfTuHUYHkWdJJWT4sBmNwuE",
  authDomain: "fushoushan-tea.firebaseapp.com",
  projectId: "fushoushan-tea",
  storageBucket: "fushoushan-tea.firebasestorage.app",
  messagingSenderId: "345028316055",
  appId: "1:345028316055:web:91011a23d738c7390cd2d2"
};

const _app = initializeApp(firebaseConfig);
const _db = getFirestore(_app);
const _ref = doc(_db, "teaapp", "data");

async function loadData() {
  try {
    const snap = await getDoc(_ref);
    if (snap.exists()) return JSON.parse(snap.data().payload);
  } catch(e) { console.error("loadData:", e); }
  // fallback localStorage
  try {
    const local = localStorage.getItem("fushoushan_tea");
    return local ? JSON.parse(local) : null;
  } catch { return null; }
}

async function saveData(data) {
  // 同時存 Firebase 和 localStorage
  try { await setDoc(_ref, { payload: JSON.stringify(data) }); } catch(e) { console.error("saveData firebase:", e); }
  try { localStorage.setItem("fushoushan_tea", JSON.stringify(data)); } catch {}
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCSV(batches, blends) {
  const rows = [
    ["類型","批號","日期","天氣","師傅人數","最終分數","等級","包裝","農藥檢驗","備註"],
  ];
  for (const b of batches) {
    const g = b.finalized ? GRADES.find(x=>x.id===b.finalGrade) : null;
    const pest = b.pesticide;
    const pestStr = pest ? (pest.passed ? "合格" : `不合格: ${pest.failedItems?.join(",")||""}`) : "未填";
    rows.push(["原批次", b.batchNo, b.date, b.weather||"", b.judges.length, b.finalScore||"", g?.label||"待定", g?.pkg||"", pestStr, b.notes||""]);
  }
  for (const bl of blends) {
    const g = bl.finalized ? GRADES.find(x=>x.id===bl.finalGrade) : null;
    const pest = bl.pesticide;
    const pestStr = pest ? (pest.passed ? "合格" : `不合格: ${pest.failedItems?.join(",")||""}`) : "未填";
    rows.push(["拼配", bl.blendNo, bl.date, "", bl.judges.length, bl.finalScore||"", g?.label||"待定", g?.pkg||"", pestStr, `來源: ${bl.sourceNos?.join("+")||""}`]);
  }
  const csv = "\uFEFF" + rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `梨山順韻_品評記錄_${todayStr()}.csv`;
  a.click();
}

// ─── RadarSVG ─────────────────────────────────────────────────────────────────

function RadarSVG({ dims, size=160 }) {
  const cx=size/2, cy=size/2, r=size*0.33;
  const n=DIMS.length;
  const pts = DIMS.map((d,i)=>{
    const a=(i/n)*2*Math.PI-Math.PI/2;
    const ratio=(dims[d.key]||0)/10;
    return [cx+r*ratio*Math.cos(a), cy+r*ratio*Math.sin(a)];
  });
  const grid = rt => DIMS.map((_,i)=>{ const a=(i/n)*2*Math.PI-Math.PI/2; return `${cx+r*rt*Math.cos(a)},${cy+r*rt*Math.sin(a)}`; }).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {[.25,.5,.75,1].map(rt=><polygon key={rt} points={grid(rt)} fill="none" stroke="rgba(61,107,80,.14)" strokeWidth="1"/>)}
      {DIMS.map((_,i)=>{ const a=(i/n)*2*Math.PI-Math.PI/2; return <line key={i} x1={cx} y1={cy} x2={cx+r*Math.cos(a)} y2={cy+r*Math.sin(a)} stroke="rgba(61,107,80,.18)" strokeWidth="1"/>; })}
      <polygon points={pts.map(p=>p.join(",")).join(" ")} fill="rgba(61,107,80,.2)" stroke="#3d6b50" strokeWidth="2.5" strokeLinejoin="round"/>
      {pts.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="#3d6b50"/>)}
      {DIMS.map((d,i)=>{ const a=(i/n)*2*Math.PI-Math.PI/2; return <text key={d.key} x={cx+(r+20)*Math.cos(a)} y={cy+(r+20)*Math.sin(a)} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#2e4a38" fontFamily="serif">{d.label.trim()}</text>; })}
    </svg>
  );
}

function ScoreRing({ score, size=120 }) {
  const g=getGrade(score);
  const r=size*0.37, circ=2*Math.PI*r, dash=(score/100)*circ;
  return (
    <div style={{ position:"relative", width:size, height:size, margin:"0 auto" }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e4dcd3" strokeWidth="8"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={g.color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:size*0.23, fontWeight:"bold", color:g.color, lineHeight:1 }}>{score}</div>
        <div style={{ fontSize:size*0.1, color:"#8b7a6a", marginTop:2 }}>/ 100</div>
      </div>
    </div>
  );
}

// ─── Pesticide Panel ──────────────────────────────────────────────────────────

function PesticidePanel({ pest, onChange, readOnly }) {
  const p = pest || { passed:null, reportNo:"", testDate:"", lab:"", failedItems:[], notes:"" };
  const set = (k,v) => onChange({ ...p, [k]:v });
  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:14 }}>
        {[{v:true,l:"✓ 合格",c:"#3d6b50"},{v:false,l:"✗ 不合格",c:"#b84040"}].map(opt=>(
          <button key={String(opt.v)} onClick={()=>!readOnly&&set("passed",opt.v)}
            style={{ flex:1, padding:"12px 6px", borderRadius:12, border:`2px solid ${p.passed===opt.v?opt.c:"#d0c8be"}`,
              background:p.passed===opt.v?`${opt.c}18`:"rgba(255,255,255,.5)",
              color:p.passed===opt.v?opt.c:"#8b7a6a", fontSize:15, fontWeight:"bold",
              cursor:readOnly?"default":"pointer", fontFamily:"serif" }}>
            {opt.l}
          </button>
        ))}
      </div>
      {!readOnly && <>
        <MInput label="報告編號" val={p.reportNo} set={v=>set("reportNo",v)} ph="如 SGS-XXXXXX"/>
        <MInput label="檢驗日期" type="date" val={p.testDate} set={v=>set("testDate",v)}/>
        <MInput label="檢驗機構" val={p.lab} set={v=>set("lab",v)} ph="如 SGS、台灣檢驗科技"/>
      </>}
      {readOnly && p.reportNo && (
        <div style={{ fontSize:13, color:"#5a6a58", marginBottom:6 }}>報告編號：{p.reportNo}</div>
      )}
      {p.passed===false && (
        <div style={{ marginBottom:10 }}>
          <Lbl>不合格項目</Lbl>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {PESTICIDE_ITEMS.map(item=>{
              const on=(p.failedItems||[]).includes(item);
              return (
                <button key={item} onClick={()=>{ if(readOnly) return; set("failedItems", on?(p.failedItems||[]).filter(x=>x!==item):[...(p.failedItems||[]),item]); }}
                  style={{ padding:"6px 12px", borderRadius:18, fontSize:13, cursor:readOnly?"default":"pointer", fontFamily:"serif",
                    border:on?"2px solid #b84040":"1.5px solid #d0c8be",
                    background:on?"rgba(184,64,64,.12)":"rgba(255,255,255,.5)",
                    color:on?"#b84040":"#7a6a58" }}>
                  {item}
                </button>
              );
            })}
          </div>
          <MInput label="其他說明" val={p.notes} set={v=>set("notes",v)} ph="如超標倍數、處理方式"/>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [batches, setBatches]   = useState([]);
  const [blends,  setBlends]    = useState([]);
  const [loading, setLoading]   = useState(true);
  const [page,    setPage]      = useState("home"); // home|batch|blend|judge|result|blendResult|summary|pestBatch|pestBlend
  const [tab,     setTab]       = useState("batch"); // batch|blend
  const [curBatch,setCurBatch]  = useState(null);
  const [curBlend,setCurBlend]  = useState(null);
  const [curJudge,setCurJudge]  = useState(null);
  const [judgeStep,setJudgeStep]= useState(0);
  const [judgeFor, setJudgeFor] = useState("batch"); // batch|blend

  // modals
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [showAddBlend, setShowAddBlend] = useState(false);
  const [showAddJudge, setShowAddJudge] = useState(false);

  // add batch form
  const [nFarm,  setNFarm]      = useState("DB"); // DB | LS
  const [nDate, setNDate]       = useState(todayStr());
  const [nSuffix,setNSuffix]    = useState("春");
  const [nWeather,setNWeather]  = useState("");
  const [nNotes, setNNotes]     = useState("");

  // add blend form
  const [blendSrcs, setBlendSrcs] = useState([]);
  const [blendCustomNo, setBlendCustomNo] = useState("");
  const [blendNotes, setBlendNotes] = useState("");
  const [blendDate, setBlendDate]   = useState(todayStr());

  // add judge
  const [nJudgeName, setNJudgeName] = useState("");

  // ── Load from cloud on mount
  useEffect(() => {
    loadData().then(saved => {
      if (saved) { setBatches(saved.batches||[]); setBlends(saved.blends||[]); }
      setLoading(false);
    });
  }, []);

  // ── Save to cloud on every change (skip initial empty state)
  useEffect(() => {
    if (!loading) saveData({ batches, blends });
  }, [batches, blends, loading]);

  // ── helpers
  const updateBatch = useCallback(b => {
    setCurBatch(b);
    setBatches(bs=>bs.map(x=>x.id===b.id?b:x));
  },[]);
  const updateBlend = useCallback(bl => {
    setCurBlend(bl);
    setBlends(bls=>bls.map(x=>x.id===bl.id?bl:x));
  },[]);

  const yyyymmdd = d => d.replace(/-/g,""); // 2025-05-01 → 20250501

  const createBatch = () => {
    const batchNo = `${nFarm}-${yyyymmdd(nDate)}-${nSuffix}`;
    const b = { id:uid(), batchNo, farm:nFarm, date:nDate, weather:nWeather, notes:nNotes,
                judges:[], finalized:false, pesticide:null };
    setBatches(bs=>[b,...bs]);
    setNDate(todayStr()); setNSuffix("A"); setNWeather(""); setNNotes("");
    setShowAddBatch(false);
  };

  const createBlend = () => {
    const srcNos = blendSrcs.map(id=>batches.find(b=>b.id===id)?.batchNo||id);
    const autoNo = suggestBlendId(srcNos);
    const blendNo = blendCustomNo.trim() || autoNo;
    const bl = { id:uid(), blendNo, date:blendDate, sourceIds:blendSrcs, sourceNos:srcNos,
                 judges:[], finalized:false, pesticide:null, notes:blendNotes };
    setBlends(bls=>[bl,...bls]);
    setBlendSrcs([]); setBlendCustomNo(""); setBlendNotes(""); setBlendDate(todayStr());
    setShowAddBlend(false);
  };

  const addJudge = () => {
    const j = { id:uid(), name:nJudgeName.trim(), dims:{}, tags:[], note:"", submitted:false };
    if (judgeFor==="batch") {
      const updated = { ...curBatch, judges:[...curBatch.judges, j] };
      updateBatch(updated);
    } else {
      const updated = { ...curBlend, judges:[...curBlend.judges, j] };
      updateBlend(updated);
    }
    setNJudgeName(""); setShowAddJudge(false);
  };

  const openJudge = (j, forType) => {
    setCurJudge(JSON.parse(JSON.stringify(j)));
    setJudgeFor(forType);
    setJudgeStep(0);
    setPage("judge");
  };

  const saveJudge = (submit) => {
    const updated = { ...curJudge, submitted:submit };
    if (judgeFor==="batch") {
      const nb = { ...curBatch, judges:curBatch.judges.map(j=>j.id===updated.id?updated:j) };
      updateBatch(nb);
      setPage("batch");
    } else {
      const nb = { ...curBlend, judges:curBlend.judges.map(j=>j.id===updated.id?updated:j) };
      updateBlend(nb);
      setPage("blend");
    }
  };

  const finalizeBatch = () => {
    const avg = avgScoreOfBatch(curBatch);
    if (!avg) return;
    const grade = getGrade(avg);
    const updated = { ...curBatch, finalized:true, finalScore:avg, finalGrade:grade.id };
    updateBatch(updated);
    setPage("result");
  };

  const finalizeBlend = () => {
    const avg = avgScoreOfBatch(curBlend);
    if (!avg) return;
    const grade = getGrade(avg);
    const updated = { ...curBlend, finalized:true, finalScore:avg, finalGrade:grade.id };
    updateBlend(updated);
    setPage("blendResult");
  };

  const goBack = () => {
    if (page==="judge") { judgeFor==="batch"?setPage("batch"):setPage("blend"); return; }
    if (page==="result"||page==="batch"||page==="pestBatch") { setPage("home"); return; }
    if (page==="blendResult"||page==="blend"||page==="pestBlend") { setPage("home"); return; }
    setPage("home");
  };

  const finalized = batches.filter(b=>b.finalized);
  const finalizedBl = blends.filter(bl=>bl.finalized);

  // ── shared judge section renderer
  const JudgeSection = ({ item, forType, onFinalize, onGoResult }) => {
    // Always read live data so submitted count updates after saveJudge
    const liveItem = forType==="batch" ? (curBatch||item) : (curBlend||item);
    const avg = liveItem.finalized ? liveItem.finalScore : avgScoreOfBatch(liveItem);
    const submitted = liveItem.judges.filter(j=>j.submitted);
    return (
      <>
        <div style={{ ...card, marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <Lbl>品評師傅</Lbl>
            {!liveItem.finalized && (
              <button onClick={()=>{ setJudgeFor(forType); setShowAddJudge(true); }}
                style={{ ...btnSm, background:"rgba(61,107,80,.12)", border:"1px solid rgba(61,107,80,.3)", color:"#3d6b50" }}>
                + 新增師傅
              </button>
            )}
          </div>
          {liveItem.judges.length===0 && <div style={{ fontSize:14, color:"#9a8a7a", textAlign:"center", padding:"14px 0" }}>尚未加入評分師傅</div>}
          {liveItem.judges.map(j=>{
            const sc = j.submitted ? calcScore(j.dims) : null;
            return (
              <div key={j.id} onClick={()=>!liveItem.finalized&&openJudge(j,forType)}
                style={{ display:"flex", alignItems:"center", padding:"11px 0", borderBottom:"1px solid #ece4da", cursor:liveItem.finalized?"default":"pointer" }}>
                <div style={{ width:38, height:38, borderRadius:9, background:j.submitted?"#3d6b50":"#c0b8ae", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:"#fff", flexShrink:0, marginRight:12 }}>
                  {j.name.slice(0,1)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:"bold", color:"#251a10" }}>{j.name} 師傅</div>
                  <div style={{ fontSize:12, color:j.submitted?"#3d6b50":"#9a8a7a" }}>{j.submitted?"✓ 已提交":"尚未評分"}</div>
                  {j.tags.length>0&&<div style={{ fontSize:11, color:"#7a8a78", marginTop:2 }}>{j.tags.slice(0,3).join("、")}</div>}
                </div>
                {sc!==null && <div style={{ fontSize:22, fontWeight:"bold", color:"#3d6b50", marginRight:6 }}>{sc}</div>}
                {!liveItem.finalized && <div style={{ fontSize:13, color:"#b0a090" }}>{j.submitted?"重評":"開始"} ›</div>}
              </div>
            );
          })}
        </div>

        {!item.finalized && submitted.length>0 && (
          <div style={{ ...card, background:"#eef7f1", border:"1px solid #6dab85", marginBottom:12 }}>
            <Lbl>目前平均（{submitted.length} 位已提交）</Lbl>
            <div style={{ textAlign:"center", padding:"8px 0" }}>
              <ScoreRing score={avg} size={110}/>
              <div style={{ fontSize:15, color:"#3d6b50", marginTop:6 }}>
                預計：{getGrade(avg).badge} {getGrade(avg).label}
              </div>
            </div>
            <div style={{ marginTop:8 }}>
              {submitted.map(j=>{
                const sc=calcScore(j.dims);
                return (
                  <div key={j.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                    <div style={{ width:26,height:26,borderRadius:6,background:"#3d6b50",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",flexShrink:0 }}>{j.name.slice(0,1)}</div>
                    <span style={{ fontSize:13, color:"#2c3a2c", flex:1 }}>{j.name}</span>
                    <div style={{ width:80,height:5,borderRadius:3,background:"#d0e8d8",overflow:"hidden" }}>
                      <div style={{ height:"100%",borderRadius:3,width:`${sc}%`,background:"#3d6b50" }}/>
                    </div>
                    <span style={{ fontSize:13, fontWeight:"bold", color:"#3d6b50", width:24, textAlign:"right" }}>{sc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!liveItem.finalized ? (
          <div>
            <Btn label="✓ 確認定級" onClick={onFinalize} disabled={submitted.length===0}/>
            {submitted.length===0&&<div style={{ fontSize:12,color:"#9a8a7a",textAlign:"center",marginTop:6 }}>至少需要 1 位師傅提交評分</div>}
          </div>
        ) : (
          <Btn label="查看定級結果 →" onClick={onGoResult}/>
        )}
      </>
    );
  };

  // ── Result renderer (shared for batch & blend)
  const ResultView = ({ item, isBlend }) => {
    const g = GRADES.find(x=>x.id===item.finalGrade);
    const submitted = item.judges.filter(j=>j.submitted);
    const avgDims = {};
    for (const d of DIMS) {
      const vals = submitted.map(j=>j.dims[d.key]||0);
      avgDims[d.key] = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10 : 0;
    }
    const allTags = [...new Set(submitted.flatMap(j=>j.tags))];
    const pest = item.pesticide;
    return (
      <div style={{ padding:"14px 14px 40px" }}>
        <div style={{ background:`linear-gradient(150deg,${g.color}20,${g.light})`, border:`2px solid ${g.border}`, borderRadius:20, padding:20, marginBottom:14, textAlign:"center" }}>
          <div style={{ fontSize:11, color:g.color, letterSpacing:3, marginBottom:4 }}>
            {isBlend?"拼配 ":""}FINAL GRADE · {submitted.length} 位師傅評鑑
          </div>
          <div style={{ fontSize:40, marginBottom:4 }}>{g.badge}</div>
          <ScoreRing score={item.finalScore} size={120}/>
          <div style={{ fontSize:28, color:g.color, fontWeight:"bold", marginTop:8 }}>{g.id} · {g.label}</div>
        </div>

        <div style={{ background:"linear-gradient(135deg,#182a1c,#2c4a32)", borderRadius:14, padding:16, marginBottom:12, color:"#e6f0e6" }}>
          <div style={{ fontSize:10, color:"#6aab82", letterSpacing:3, marginBottom:6 }}>📦 包裝建議</div>
          <div style={{ fontSize:16, fontWeight:"bold", marginBottom:4 }}>{g.pkg}</div>
          <div style={{ fontSize:20, color:"#a8c4a0", fontWeight:"bold" }}>{g.price}</div>
          <div style={{ fontSize:11, color:"#6a9c70", marginTop:8 }}>
            福壽山順韻茶葉 · {item.batchNo||item.blendNo} · {item.date}
            {isBlend && item.sourceNos?.length && <span style={{ display:"block", marginTop:3 }}>來源：{item.sourceNos.join(" + ")}</span>}
          </div>
        </div>

        {/* Pesticide */}
        <div style={{ ...card, border:`1.5px solid ${pest?.passed===true?"#6dab85":pest?.passed===false?"#e08080":"#d0c8be"}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <Lbl>農藥檢驗</Lbl>
            {!pest?.passed===null&&<button onClick={()=>setPage(isBlend?"pestBlend":"pestBatch")} style={{ ...btnSm, background:"rgba(61,107,80,.1)", border:"1px solid rgba(61,107,80,.3)", color:"#3d6b50" }}>填寫</button>}
          </div>
          {!pest ? (
            <div style={{ textAlign:"center", padding:"10px 0" }}>
              <div style={{ fontSize:14, color:"#9a8a7a", marginBottom:8 }}>尚未填寫農藥檢驗</div>
              <button onClick={()=>setPage(isBlend?"pestBlend":"pestBatch")} style={{ padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2c4a32,#3d6b50)", color:"#e6f0e6", fontSize:14, cursor:"pointer", fontFamily:"serif" }}>
                填寫檢驗結果
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:18, fontWeight:"bold", color:pest.passed?"#3d6b50":"#b84040", marginBottom:6 }}>
                {pest.passed ? "✓ 合格" : "✗ 不合格"}
              </div>
              {pest.reportNo&&<div style={{ fontSize:13, color:"#5a6a58" }}>報告編號：{pest.reportNo}</div>}
              {pest.testDate&&<div style={{ fontSize:13, color:"#5a6a58" }}>檢驗日期：{pest.testDate}</div>}
              {pest.lab&&<div style={{ fontSize:13, color:"#5a6a58" }}>檢驗機構：{pest.lab}</div>}
              {pest.passed===false && pest.failedItems?.length>0 && (
                <div style={{ marginTop:6, display:"flex", flexWrap:"wrap", gap:6 }}>
                  {pest.failedItems.map(i=><span key={i} style={{ fontSize:12, background:"rgba(184,64,64,.1)", color:"#b84040", borderRadius:8, padding:"3px 10px", border:"1px solid rgba(184,64,64,.25)" }}>{i}</span>)}
                </div>
              )}
              <button onClick={()=>setPage(isBlend?"pestBlend":"pestBatch")} style={{ marginTop:10, padding:"8px 16px", borderRadius:8, border:"1px solid #d0c8be", background:"transparent", color:"#7a6a58", fontSize:12, cursor:"pointer", fontFamily:"serif" }}>
                修改檢驗結果
              </button>
            </div>
          )}
        </div>

        <div style={{ ...card, display:"flex", justifyContent:"center" }}>
          <div>
            <div style={{ fontSize:10, color:"#7a9e7e", letterSpacing:2, textAlign:"center", marginBottom:4 }}>平均風味雷達</div>
            <RadarSVG dims={avgDims} size={180}/>
          </div>
        </div>

        <div style={card}>
          <Lbl>師傅評分明細</Lbl>
          {submitted.map(j=>{
            const sc=calcScore(j.dims);
            const jg=getGrade(sc);
            return (
              <div key={j.id} style={{ padding:"11px 0", borderBottom:"1px solid #ece4da" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                  <div style={{ width:34,height:34,borderRadius:8,background:jg.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff" }}>{j.name.slice(0,1)}</div>
                  <span style={{ fontSize:15, fontWeight:"bold", color:"#251a10", flex:1 }}>{j.name}</span>
                  <span style={{ fontSize:20, fontWeight:"bold", color:jg.color }}>{sc}</span>
                  <span style={{ fontSize:12, color:jg.color, background:jg.light, border:`1px solid ${jg.border}`, borderRadius:8, padding:"2px 8px" }}>{jg.id}</span>
                </div>
                {DIMS.map(d=>(
                  <div key={d.key} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                    <span style={{ fontSize:11, color:"#8b7a6a", width:60, flexShrink:0 }}>{d.label.trim()}</span>
                    <div style={{ flex:1, height:5, borderRadius:3, background:"#e4dcd3", overflow:"hidden" }}>
                      <div style={{ height:"100%",borderRadius:3,width:`${(j.dims[d.key]||0)*10}%`,background:jg.color,opacity:.75 }}/>
                    </div>
                    <span style={{ fontSize:11, fontWeight:"bold", color:jg.color, width:18, textAlign:"right" }}>{j.dims[d.key]??"-"}</span>
                  </div>
                ))}
                {j.note&&<div style={{ fontSize:12, color:"#5a6a58", marginTop:4, fontStyle:"italic" }}>「{j.note}」</div>}
                {j.tags.length>0&&<div style={{ marginTop:4, display:"flex", flexWrap:"wrap", gap:4 }}>{j.tags.map(t=><span key={t} style={{ fontSize:11, background:`${jg.color}15`, color:jg.color, borderRadius:8, padding:"2px 8px" }}>{t}</span>)}</div>}
              </div>
            );
          })}
        </div>

        {allTags.length>0&&(
          <div style={card}>
            <Lbl>綜合風味標籤</Lbl>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginTop:4 }}>
              {allTags.map(t=><span key={t} style={{ fontSize:13, background:"rgba(61,107,80,.12)", color:"#3d6b50", borderRadius:12, padding:"5px 12px", border:"1px solid rgba(61,107,80,.22)" }}>{t}</span>)}
            </div>
          </div>
        )}

        <Btn label="返回列表" onClick={()=>setPage("home")}/>
      </div>
    );
  };

  // ── Judge rating page
  const JudgePage = () => {
    const setDim = (k,v) => setCurJudge(c=>({...c,dims:{...c.dims,[k]:v}}));
    const toggleTag = t => setCurJudge(c=>({ ...c, tags:c.tags.includes(t)?c.tags.filter(x=>x!==t):[...c.tags,t] }));
    const filled = DIMS.filter(d=>curJudge.dims[d.key]!==undefined).length;
    const preScore = filled>0 ? calcScore(curJudge.dims) : null;
    const preG = preScore!==null ? getGrade(preScore) : null;

    return (
      <div style={{ padding:"14px 14px 40px" }}>
        <div style={{ background:"linear-gradient(135deg,#182a1c,#2c4a32)", borderRadius:14, padding:"13px 16px", marginBottom:14, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:44,height:44,borderRadius:11,background:"#3d6b50",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#fff",flexShrink:0 }}>
            {curJudge.name.slice(0,1)}
          </div>
          <div>
            <div style={{ fontSize:11, color:"#6aab82", letterSpacing:2 }}>獨立評分</div>
            <div style={{ fontSize:17, color:"#e6f0e6", fontWeight:"bold" }}>{curJudge.name} 師傅</div>
            <div style={{ fontSize:11, color:"#8dc4a0" }}>{judgeFor==="batch"?curBatch?.batchNo:curBlend?.blendNo}</div>
          </div>
          {preScore!==null && (
            <div style={{ marginLeft:"auto", textAlign:"right" }}>
              <div style={{ fontSize:24, fontWeight:"bold", color:preG.color }}>{preScore}</div>
              <div style={{ fontSize:11, color:preG.color }}>{preG.label}</div>
            </div>
          )}
        </div>

        {/* Step tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:16 }}>
          {["風味評分","風味標籤","農藥檢驗","確認提交"].map((s,i)=>(
            <div key={i} onClick={()=>setJudgeStep(i)} style={{ flex:1, cursor:"pointer" }}>
              <div style={{ height:4, borderRadius:2, background:judgeStep>=i?"#3d6b50":"#d0c8be", marginBottom:3, transition:"background .2s" }}/>
              <div style={{ fontSize:10, color:judgeStep===i?"#3d6b50":"#a09080", textAlign:"center" }}>{s}</div>
            </div>
          ))}
        </div>

        {judgeStep===0 && (
          <div>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}>
              <RadarSVG dims={curJudge.dims} size={170}/>
            </div>
            <div style={card}>
              <Lbl>各項評分（點選 1–10）</Lbl>
              {DIMS.map(d=>{
                const val=curJudge.dims[d.key]??null;
                return (
                  <div key={d.key} style={{ marginBottom:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <div>
                        <span style={{ fontSize:15, fontWeight:"bold", color:"#251a10" }}>{d.label.trim()}</span>
                        <span style={{ fontSize:11, color:"#8b7a6a", marginLeft:6 }}>×{d.w}%</span>
                      </div>
                      <span style={{ fontSize:16, fontWeight:"bold", color:"#3d6b50" }}>{val??"-"}</span>
                    </div>
                    <div style={{ fontSize:12, color:"#9a8a7a", marginBottom:6 }}>{d.hint}</div>
                    <div style={{ display:"flex", gap:3 }}>
                      {[1,2,3,4,5,6,7,8,9,10].map(n=>{
                        const active=val!==null&&n<=val;
                        return (
                          <button key={n} onClick={()=>setDim(d.key,n)}
                            style={{ flex:1, height:32, borderRadius:5, border:"none", cursor:"pointer", fontSize:11, fontFamily:"monospace",
                              background:active?(val>=8?"#3d6b50":val>=6?"#6dab85":"#a8ccb4"):"#e4dcd3",
                              color:active?"#fff":"#9a9080", fontWeight:active?"bold":"normal" }}>
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <Btn label="下一步：風味標籤 →" onClick={()=>setJudgeStep(1)}/>
          </div>
        )}

        {judgeStep===1 && (
          <div>
            <div style={card}>
              <Lbl>風味標籤（可複選）</Lbl>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6 }}>
                {FLAVOR_TAGS.map(t=>{
                  const on=curJudge.tags.includes(t);
                  return (
                    <button key={t} onClick={()=>toggleTag(t)}
                      style={{ padding:"9px 17px", borderRadius:22, fontSize:14, cursor:"pointer", fontFamily:"serif",
                        border:on?"1.5px solid #3d6b50":"1.5px solid #d0c8be",
                        background:on?"rgba(61,107,80,.14)":"rgba(255,255,255,.5)",
                        color:on?"#24472e":"#7a6a58" }}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={card}>
              <Lbl>個人備註</Lbl>
              <textarea value={curJudge.note} onChange={e=>setCurJudge(c=>({...c,note:e.target.value}))}
                placeholder="記錄個人品評感受..."
                style={{ width:"100%", minHeight:80, border:"1px solid #d0c8be", borderRadius:10, padding:12, fontSize:"16px", background:"rgba(255,255,255,.6)", color:"#251a10", fontFamily:"serif", resize:"none", outline:"none", boxSizing:"border-box", lineHeight:1.7, WebkitTextSizeAdjust:"100%" }}/>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn label="← 返回" onClick={()=>setJudgeStep(0)} secondary/>
              <Btn label="下一步：農藥檢驗 →" onClick={()=>setJudgeStep(2)}/>
            </div>
          </div>
        )}

        {judgeStep===2 && (
          <div>
            <div style={{ ...card, border:"1.5px solid #c0d8a0" }}>
              <div style={{ fontSize:16, fontWeight:"bold", color:"#2c4a32", marginBottom:4 }}>🧪 農藥檢驗記錄</div>
              <div style={{ fontSize:13, color:"#7a8a78", marginBottom:12 }}>此批次農藥檢驗結果</div>
              <PesticidePanel
                pest={judgeFor==="batch" ? curBatch?.pesticide : curBlend?.pesticide}
                onChange={p=>{
                  if(judgeFor==="batch") { const u={...curBatch,pesticide:p}; setCurBatch(u); setBatches(bs=>bs.map(x=>x.id===u.id?u:x)); }
                  else { const u={...curBlend,pesticide:p}; setCurBlend(u); setBlends(bls=>bls.map(x=>x.id===u.id?u:x)); }
                }}
                readOnly={false}
              />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn label="← 返回" onClick={()=>setJudgeStep(1)} secondary/>
              <Btn label="確認提交 →" onClick={()=>setJudgeStep(3)}/>
            </div>
          </div>
        )}

        {judgeStep===3 && (
          <div>
            {preScore!==null && (
              <div style={{ ...card, background:preG.light, border:`2px solid ${preG.border}`, textAlign:"center", marginBottom:12 }}>
                <div style={{ fontSize:12, color:preG.color, letterSpacing:2, marginBottom:8 }}>本次評分預覽</div>
                <ScoreRing score={preScore} size={120}/>
                <div style={{ fontSize:24, color:preG.color, fontWeight:"bold", marginTop:8 }}>{preG.badge} {preG.id}·{preG.label}</div>
              </div>
            )}
            <div style={card}>
              <Lbl>評分摘要</Lbl>
              {DIMS.map(d=>(
                <div key={d.key} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:13, color:"#251a10", width:64, flexShrink:0 }}>{d.label.trim()}</span>
                  <div style={{ flex:1, height:6, borderRadius:3, background:"#e4dcd3", overflow:"hidden" }}>
                    <div style={{ height:"100%",borderRadius:3,width:`${(curJudge.dims[d.key]||0)*10}%`,background:"linear-gradient(to right,#6dab85,#3d6b50)" }}/>
                  </div>
                  <span style={{ fontSize:13, fontWeight:"bold", color:"#3d6b50", width:20, textAlign:"right" }}>{curJudge.dims[d.key]??"-"}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              <Btn label="← 修改" onClick={()=>setJudgeStep(2)} secondary/>
              <Btn label="✓ 提交評分" onClick={()=>saveJudge(true)}/>
            </div>
            <button onClick={()=>saveJudge(false)} style={{ width:"100%", padding:"12px", borderRadius:11, border:"1.5px solid #d0c8be", background:"transparent", color:"#8b7a6a", fontSize:14, cursor:"pointer", fontFamily:"serif" }}>
              暫存（不提交）
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────── RENDER ───────────────────────────────────────

  // Loading screen
  if (loading) return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(150deg,#182a1c,#2c4a32)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif" }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🍃</div>
      <div style={{ fontSize:18, color:"#e6f0e6", letterSpacing:2 }}>載入資料中...</div>
      <div style={{ fontSize:13, color:"#6aab82", marginTop:8 }}>從雲端同步最新評比記錄</div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#f0ebe4", fontFamily:"'Georgia','Noto Serif TC',serif", color:"#251a10", maxWidth:480, margin:"0 auto" }}>

      {/* HEADER */}
      <div style={{ background:"linear-gradient(150deg,#182a1c,#2c4a32,#3a5c3d)", padding:"18px 18px 14px", position:"sticky", top:0, zIndex:30, boxShadow:"0 4px 20px rgba(15,35,18,.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {page!=="home"&&page!=="summary" && (
            <button onClick={goBack} style={{ background:"none",border:"none",color:"#8dc4a0",fontSize:24,cursor:"pointer",padding:0,lineHeight:1 }}>←</button>
          )}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:"#6aab82", letterSpacing:4 }}>FU SHOU SHAN SHUN YUN · TEA EVALUATION</div>
            <div style={{ fontSize:17, color:"#e6f0e6", letterSpacing:.5, marginTop:2 }}>福壽山順韻茶葉 品評定級系統</div>
          </div>
          <button onClick={async()=>{ setLoading(true); const d=await loadData(); if(d){setBatches(d.batches||[]);setBlends(d.blends||[]);} setLoading(false); }} style={{ background:"rgba(140,196,160,.15)",border:"1px solid rgba(140,196,160,.3)",color:"#8dc4a0",borderRadius:18,padding:"5px 12px",fontSize:11,cursor:"pointer" }}>
            ↻ 同步
          </button>
          <button onClick={()=>exportCSV(batches,blends)} style={{ background:"rgba(140,196,160,.15)",border:"1px solid rgba(140,196,160,.3)",color:"#8dc4a0",borderRadius:18,padding:"5px 12px",fontSize:11,cursor:"pointer" }}>
            匯出
          </button>
          <button onClick={()=>setPage("summary")} style={{ background:"rgba(140,196,160,.15)",border:"1px solid rgba(140,196,160,.3)",color:"#8dc4a0",borderRadius:18,padding:"5px 12px",fontSize:11,cursor:"pointer",marginLeft:4 }}>
            總覽
          </button>
        </div>
      </div>

      {/* ══ HOME */}
      {page==="home" && (
        <div style={{ padding:"14px 14px 80px" }}>
          {/* Tabs */}
          <div style={{ display:"flex", gap:0, marginBottom:14, background:"rgba(255,255,255,.5)", borderRadius:12, padding:3 }}>
            {[["batch","原批次"],["blend","拼配批次"]].map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"serif", fontSize:15, fontWeight:"bold",
                background:tab===t?"linear-gradient(135deg,#2c4a32,#3d6b50)":"transparent",
                color:tab===t?"#e6f0e6":"#6b5a48" }}>
                {l}
              </button>
            ))}
          </div>

          {/* Grade chips */}
          <div style={{ display:"flex", gap:6, marginBottom:12, overflowX:"auto", paddingBottom:2 }}>
            {GRADES.map(g=>{
              const cnt = tab==="batch"
                ? batches.filter(b=>b.finalized&&b.finalGrade===g.id).length
                : blends.filter(b=>b.finalized&&b.finalGrade===g.id).length;
              return (
                <div key={g.id} style={{ flexShrink:0, background:g.light, border:`1px solid ${g.border}`, borderRadius:10, padding:"4px 11px", fontSize:11, color:g.color, display:"flex", alignItems:"center", gap:4 }}>
                  {g.badge} {g.id}·{g.label}
                  {cnt>0&&<span style={{ background:g.color,color:"#fff",borderRadius:8,padding:"0 5px",fontSize:10 }}>{cnt}</span>}
                </div>
              );
            })}
          </div>

          {/* Batch list */}
          {tab==="batch" && (
            <>
              {batches.length===0 && <EmptyState msg="尚無批次，請點右下角＋新增"/>}
              {batches.map(b=>{
                const avg=b.finalized?b.finalScore:avgScoreOfBatch(b);
                const g=avg!==null?getGrade(avg):null;
                const sub=b.judges.filter(j=>j.submitted).length;
                const pest=b.pesticide;
                return (
                  <div key={b.id} onClick={()=>{setCurBatch(b);setPage("batch");}}
                    style={{ background:b.finalized?(g?.light||"#fff"):"rgba(255,255,255,.72)", border:`1.5px solid ${b.finalized?(g?.border||"#d0c8be"):"#ddd5c8"}`, borderRadius:14, padding:"14px 15px", marginBottom:9, cursor:"pointer", display:"flex", alignItems:"center", gap:12, boxShadow:"0 1px 8px rgba(30,20,10,.07)" }}>
                    <div style={{ width:50,height:50,borderRadius:11,flexShrink:0,background:b.finalized?(g?.color||"#8b7a6a"):"#b8b0a8",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
                      {b.finalized?<><div style={{ fontSize:11,color:"rgba(255,255,255,.8)" }}>{g?.badge}</div><div style={{ fontSize:15,fontWeight:"bold",color:"#fff" }}>{g?.id}</div></>:<div style={{ fontSize:12,color:"#fff" }}>待評</div>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:16, fontWeight:"bold", color:"#251a10", marginBottom:2 }}>{b.batchNo}</div>
                      <div style={{ fontSize:13, color:"#7a6a58" }}>{b.date}{b.weather?` · ${b.weather}`:""}</div>
                      <div style={{ fontSize:12, color:"#9a8a7a", marginTop:2 }}>{b.judges.length>0?`${sub}/${b.judges.length} 位師傅已提交`:"尚未加入師傅"}</div>
                      {pest&&<div style={{ fontSize:11, marginTop:3, color:pest.passed?"#3d6b50":"#b84040" }}>{pest.passed?"農藥 ✓ 合格":"農藥 ✗ 不合格"}</div>}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      {avg!==null?<><div style={{ fontSize:24,fontWeight:"bold",color:g?.color }}>{avg}</div><div style={{ fontSize:12,color:g?.color }}>{g?.label}</div></>:<div style={{ fontSize:12,color:"#b0a090" }}>進入 →</div>}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Blend list */}
          {tab==="blend" && (
            <>
              {blends.length===0 && <EmptyState msg="尚無拼配批次，請點右下角＋新增"/>}
              {blends.map(bl=>{
                const avg=bl.finalized?bl.finalScore:avgScoreOfBatch(bl);
                const g=avg!==null?getGrade(avg):null;
                const sub=bl.judges.filter(j=>j.submitted).length;
                const pest=bl.pesticide;
                return (
                  <div key={bl.id} onClick={()=>{setCurBlend(bl);setPage("blend");}}
                    style={{ background:bl.finalized?(g?.light||"#fff"):"rgba(255,255,255,.72)", border:`1.5px solid ${bl.finalized?(g?.border||"#d0c8be"):"#ddd5c8"}`, borderRadius:14, padding:"14px 15px", marginBottom:9, cursor:"pointer", display:"flex", alignItems:"center", gap:12, boxShadow:"0 1px 8px rgba(30,20,10,.07)" }}>
                    <div style={{ width:50,height:50,borderRadius:11,flexShrink:0,background:bl.finalized?(g?.color||"#8b7a6a"):"#7a6a58",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
                      {bl.finalized?<><div style={{ fontSize:11,color:"rgba(255,255,255,.8)" }}>{g?.badge}</div><div style={{ fontSize:15,fontWeight:"bold",color:"#fff" }}>{g?.id}</div></>:<div style={{ fontSize:12,color:"#fff" }}>拼配</div>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:16, fontWeight:"bold", color:"#251a10", marginBottom:2 }}>{bl.blendNo}</div>
                      <div style={{ fontSize:12, color:"#7a6a58", marginBottom:2 }}>來源：{bl.sourceNos?.join(" + ")||"—"}</div>
                      <div style={{ fontSize:12, color:"#9a8a7a" }}>{sub}/{bl.judges.length} 位師傅已提交</div>
                      {pest&&<div style={{ fontSize:11, marginTop:3, color:pest.passed?"#3d6b50":"#b84040" }}>{pest.passed?"農藥 ✓ 合格":"農藥 ✗ 不合格"}</div>}
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      {avg!==null?<><div style={{ fontSize:24,fontWeight:"bold",color:g?.color }}>{avg}</div><div style={{ fontSize:12,color:g?.color }}>{g?.label}</div></>:<div style={{ fontSize:12,color:"#b0a090" }}>進入 →</div>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ══ BATCH DETAIL */}
      {page==="batch" && curBatch && (
        <div style={{ padding:"14px 14px 40px" }}>
          <div style={{ background:"linear-gradient(135deg,#182a1c,#2c4a32)", borderRadius:16, padding:16, marginBottom:14, color:"#e6f0e6" }}>
            <div style={{ fontSize:10,color:"#6aab82",letterSpacing:3,marginBottom:4 }}>BATCH · 原批次</div>
            <div style={{ fontSize:22, fontWeight:"bold", marginBottom:2 }}>{curBatch.batchNo}</div>
            <div style={{ fontSize:13, color:"#8dc4a0" }}>{curBatch.date}{curBatch.weather?` · ${curBatch.weather}`:""}</div>
            {curBatch.notes&&<div style={{ fontSize:13,color:"#7ab893",marginTop:6,fontStyle:"italic" }}>「{curBatch.notes}」</div>}
          </div>
          <JudgeSection item={curBatch} forType="batch"
            onFinalize={finalizeBatch}
            onGoResult={()=>setPage("result")}/>
          {curBatch.finalized&&(
            <button onClick={()=>setPage("pestBatch")} style={{ ...outlineBtn, marginTop:8 }}>
              農藥檢驗記錄 {curBatch.pesticide?(curBatch.pesticide.passed?"✓":"✗"):"（未填）"}
            </button>
          )}
          <button onClick={()=>{
            if(window.confirm(`確定刪除「${curBatch.batchNo}」？此動作無法復原`)){
              setBatches(bs=>bs.filter(b=>b.id!==curBatch.id));
              setPage("home");
            }
          }} style={{ ...outlineBtn, marginTop:8, color:"#b84040", borderColor:"#e0b0b0" }}>
            刪除此批次
          </button>
        </div>
      )}

      {/* ══ BLEND DETAIL */}
      {page==="blend" && curBlend && (
        <div style={{ padding:"14px 14px 40px" }}>
          <div style={{ background:"linear-gradient(135deg,#1a2a3a,#2c4050)", borderRadius:16, padding:16, marginBottom:14, color:"#e6f0e6" }}>
            <div style={{ fontSize:10,color:"#6aabc4",letterSpacing:3,marginBottom:4 }}>BLEND · 拼配批次</div>
            <div style={{ fontSize:22, fontWeight:"bold", marginBottom:4 }}>{curBlend.blendNo}</div>
            <div style={{ fontSize:13, color:"#8dc0c4", marginBottom:6 }}>{curBlend.date}</div>
            <div style={{ fontSize:12, color:"#6aabc4" }}>來源批次</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
              {curBlend.sourceNos?.map(no=><span key={no} style={{ fontSize:13, background:"rgba(100,180,200,.2)", color:"#b0d8e0", borderRadius:8, padding:"3px 10px", border:"1px solid rgba(100,180,200,.3)" }}>{no}</span>)}
            </div>
          </div>
          <JudgeSection item={curBlend} forType="blend"
            onFinalize={finalizeBlend}
            onGoResult={()=>setPage("blendResult")}/>
          {curBlend.finalized&&(
            <button onClick={()=>setPage("pestBlend")} style={{ ...outlineBtn, marginTop:8 }}>
              農藥檢驗記錄 {curBlend.pesticide?(curBlend.pesticide.passed?"✓":"✗"):"（未填）"}
            </button>
          )}
          <button onClick={()=>{
            if(window.confirm(`確定刪除「${curBlend.blendNo}」？此動作無法復原`)){
              setBlends(bls=>bls.filter(b=>b.id!==curBlend.id));
              setPage("home");
            }
          }} style={{ ...outlineBtn, marginTop:8, color:"#b84040", borderColor:"#e0b0b0" }}>
            刪除此批次
          </button>
        </div>
      )}

      {/* ══ JUDGE */}
      {page==="judge" && curJudge && <JudgePage/>}

      {/* ══ RESULT */}
      {page==="result" && curBatch?.finalized && <ResultView item={curBatch} isBlend={false}/>}
      {page==="blendResult" && curBlend?.finalized && <ResultView item={curBlend} isBlend={true}/>}

      {/* ══ PESTICIDE BATCH */}
      {page==="pestBatch" && curBatch && (
        <div style={{ padding:"14px 14px 40px" }}>
          <div style={{ ...card, marginBottom:14 }}>
            <div style={{ fontSize:14,color:"#2c4a32",fontWeight:"bold",marginBottom:4 }}>🧪 農藥檢驗記錄</div>
            <div style={{ fontSize:13,color:"#7a6a58",marginBottom:12 }}>{curBatch.batchNo} · {curBatch.date}</div>
            <PesticidePanel pest={curBatch.pesticide} onChange={p=>{const u={...curBatch,pesticide:p};updateBatch(u);}} readOnly={false}/>
          </div>
          <Btn label="儲存並返回" onClick={()=>setPage("result")}/>
        </div>
      )}

      {/* ══ PESTICIDE BLEND */}
      {page==="pestBlend" && curBlend && (
        <div style={{ padding:"14px 14px 40px" }}>
          <div style={{ ...card, marginBottom:14 }}>
            <div style={{ fontSize:14,color:"#2c4a32",fontWeight:"bold",marginBottom:4 }}>🧪 農藥檢驗記錄</div>
            <div style={{ fontSize:13,color:"#7a6a58",marginBottom:12 }}>{curBlend.blendNo} · {curBlend.date}</div>
            <PesticidePanel pest={curBlend.pesticide} onChange={p=>{const u={...curBlend,pesticide:p};updateBlend(u);}} readOnly={false}/>
          </div>
          <Btn label="儲存並返回" onClick={()=>setPage("blendResult")}/>
        </div>
      )}

      {/* ══ SUMMARY */}
      {page==="summary" && (
        <div style={{ padding:"14px 14px 40px" }}>
          <h2 style={{ fontSize:16,color:"#2c4a32",margin:"4px 0 14px",letterSpacing:1 }}>◈ 福壽山順韻 品評總覽</h2>
          {[["原批次",batches],["拼配批次",blends]].map(([lbl,list])=>{
            const fin=list.filter(b=>b.finalized);
            const scores=fin.map(b=>b.finalScore);
            const avg=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):null;
            const maxS=scores.length?Math.max(...scores):null;
            const minS=scores.length?Math.min(...scores):null;
            return (
              <div key={lbl}>
                <div style={{ fontSize:13,color:"#3d6b50",fontWeight:"bold",margin:"10px 0 8px",letterSpacing:1 }}>── {lbl}</div>
                <div style={card}>
                  <Lbl>等級分布（{fin.length}/{list.length} 已定級）</Lbl>
                  {GRADES.map(g=>{
                    const cnt=fin.filter(b=>b.finalGrade===g.id).length;
                    const pct=fin.length?(cnt/fin.length)*100:0;
                    return (
                      <div key={g.id} style={{ marginBottom:10, marginTop:6 }}>
                        <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                          <span style={{ fontSize:13,color:g.color,fontWeight:"bold" }}>{g.badge} {g.id}·{g.label}</span>
                          <span style={{ fontSize:12,color:g.color }}>{cnt} 批 ({pct.toFixed(0)}%)</span>
                        </div>
                        <div style={{ height:8,borderRadius:4,background:"#e4dcd3",overflow:"hidden" }}>
                          <div style={{ height:"100%",borderRadius:4,width:`${pct}%`,background:g.color }}/>
                        </div>
                      </div>
                    );
                  })}
                  {scores.length>0&&(
                    <div style={{ display:"flex",gap:8,marginTop:10 }}>
                      {[["平均",avg,"#3d6b50"],["最高",maxS,"#a07828"],["最低",minS,"#6b5a48"]].map(([l,v,c])=>(
                        <div key={l} style={{ flex:1,textAlign:"center",background:`${c}11`,border:`1px solid ${c}30`,borderRadius:10,padding:"8px 4px" }}>
                          <div style={{ fontSize:20,fontWeight:"bold",color:c }}>{v}</div>
                          <div style={{ fontSize:11,color:"#8a7a6a" }}>{l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {fin.length>0&&(
                  <div style={card}>
                    <Lbl>各批次一覽</Lbl>
                    {fin.sort((a,b)=>b.finalScore-a.finalScore).map(b=>{
                      const g=GRADES.find(x=>x.id===b.finalGrade);
                      const pest=b.pesticide;
                      return (
                        <div key={b.id} style={{ display:"flex",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #ece4da" }}>
                          <span style={{ fontSize:12,color:g?.color,width:38 }}>{g?.badge} {g?.id}</span>
                          <span style={{ flex:1,fontSize:14,color:"#251a10",fontWeight:"bold" }}>{b.batchNo||b.blendNo}</span>
                          {pest&&<span style={{ fontSize:12,color:pest.passed?"#3d6b50":"#b84040",marginRight:8 }}>{pest.passed?"農藥✓":"農藥✗"}</span>}
                          <span style={{ fontSize:16,fontWeight:"bold",color:g?.color }}>{b.finalScore}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <Btn label="返回列表" onClick={()=>setPage("home")}/>
        </div>
      )}

      {/* ══════ MODALS ══════ */}

      {/* Add Batch */}
      {showAddBatch && (
        <Modal onClose={()=>setShowAddBatch(false)} title="新增原批次">
          {/* Farm selector */}
          <div style={{ marginBottom:14 }}>
            <Lbl>茶廠選擇</Lbl>
            <div style={{ display:"flex", gap:8 }}>
              {[["DB","帝寶茶廠"],["LS","梨山茶廠"]].map(([f,fl])=>(
                <button key={f} onClick={()=>setNFarm(f)}
                  style={{ flex:1, padding:"12px 8px", borderRadius:12, border:`2px solid ${nFarm===f?"#3d6b50":"#d0c8be"}`,
                    background:nFarm===f?"rgba(61,107,80,.15)":"rgba(255,255,255,.5)",
                    color:nFarm===f?"#2c4a32":"#7a6a58", fontSize:14, fontWeight:"bold", cursor:"pointer", fontFamily:"serif" }}>
                  <div style={{ fontSize:18, marginBottom:2 }}>{f}</div>
                  <div style={{ fontSize:11, fontWeight:"normal" }}>{fl}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <Lbl>批號預覽</Lbl>
            <div style={{ fontSize:20, fontWeight:"bold", color:"#3d6b50", marginBottom:6, letterSpacing:1 }}>
              {nFarm}-{nDate.replace(/-/g,"")}-{nSuffix}
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:4 }}>
              <div style={{ flex:1 }}>
                <Lbl>採收日期</Lbl>
                <input type="date" value={nDate} onChange={e=>setNDate(e.target.value)} style={inputStyle}/>
              </div>
              <div>
                <Lbl>季節</Lbl>
                <div style={{ display:"flex", gap:6 }}>
                  {["春","夏","秋","冬"].map(s=>(
                    <button key={s} onClick={()=>setNSuffix(s)} style={{ width:44,height:44,borderRadius:10,border:`2px solid ${nSuffix===s?"#3d6b50":"#d0c8be"}`,background:nSuffix===s?"rgba(61,107,80,.15)":"rgba(255,255,255,.5)",color:nSuffix===s?"#3d6b50":"#7a6a58",fontSize:17,fontWeight:"bold",cursor:"pointer" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <Lbl>天氣</Lbl>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {WEATHER_OPT.map(w=>(
                <button key={w} onClick={()=>setNWeather(w)} style={{ padding:"8px 14px",borderRadius:20,fontSize:13,cursor:"pointer",fontFamily:"serif",border:nWeather===w?"1.5px solid #3d6b50":"1.5px solid #d0c8be",background:nWeather===w?"rgba(61,107,80,.12)":"rgba(255,255,255,.5)",color:nWeather===w?"#2c4a32":"#7a6a58" }}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <MInput label="備註（海拔、製程等）" val={nNotes} set={setNNotes} ph="選填"/>
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <Btn label="取消" onClick={()=>setShowAddBatch(false)} secondary/>
            <Btn label="建立批次" onClick={createBatch}/>
          </div>
        </Modal>
      )}

      {/* Add Blend */}
      {showAddBlend && (
        <Modal onClose={()=>setShowAddBlend(false)} title="新增拼配批次">
          <div style={{ marginBottom:12 }}>
            <Lbl>選擇來源批次（3～5批）</Lbl>
            {batches.filter(b=>b.finalized).length===0&&<div style={{ fontSize:13,color:"#b07a6a",marginBottom:8 }}>⚠️ 需先有已定級的原批次才能拼配</div>}
            <div style={{ maxHeight:180, overflowY:"auto", border:"1px solid #d0c8be", borderRadius:10, background:"rgba(255,255,255,.5)" }}>
              {batches.filter(b=>b.finalized).map(b=>{
                const on=blendSrcs.includes(b.id);
                return (
                  <div key={b.id} onClick={()=>setBlendSrcs(s=>on?s.filter(x=>x!==b.id):[...s,b.id])}
                    style={{ display:"flex",alignItems:"center",padding:"10px 12px",borderBottom:"1px solid #ece4da",cursor:"pointer",background:on?"rgba(61,107,80,.08)":"transparent" }}>
                    <div style={{ width:22,height:22,borderRadius:6,border:`2px solid ${on?"#3d6b50":"#d0c8be"}`,background:on?"#3d6b50":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginRight:10 }}>
                      {on&&<span style={{ color:"#fff",fontSize:13 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:14,fontWeight:"bold",color:"#251a10",flex:1 }}>{b.batchNo}</span>
                    <span style={{ fontSize:12,color:"#7a6a58" }}>{b.date}</span>
                    <span style={{ fontSize:13,fontWeight:"bold",color:GRADES.find(g=>g.id===b.finalGrade)?.color,marginLeft:8 }}>{b.finalScore}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {blendSrcs.length>0&&(
            <div style={{ marginBottom:12 }}>
              <Lbl>建議批號</Lbl>
              <div style={{ fontSize:16,fontWeight:"bold",color:"#3d6b50" }}>
                {suggestBlendId(blendSrcs.map(id=>batches.find(b=>b.id===id)?.batchNo||""))}
              </div>
            </div>
          )}
          <MInput label="自訂批號（留空則自動生成）" val={blendCustomNo} set={setBlendCustomNo} ph="如 BL-0501A+0503B"/>
          <div style={{ marginBottom:12 }}>
            <Lbl>拼配日期</Lbl>
            <input type="date" value={blendDate} onChange={e=>setBlendDate(e.target.value)} style={inputStyle}/>
          </div>
          <MInput label="備註" val={blendNotes} set={setBlendNotes} ph="選填"/>
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <Btn label="取消" onClick={()=>setShowAddBlend(false)} secondary/>
            <Btn label="建立拼配" onClick={createBlend} disabled={blendSrcs.length<2}/>
          </div>
        </Modal>
      )}

      {/* Add Judge */}
      {showAddJudge && (
        <Modal onClose={()=>setShowAddJudge(false)} title="加入品評師傅">
          <MInput label="師傅姓名" val={nJudgeName} set={setNJudgeName} ph="如 王師傅、阿明"/>
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <Btn label="取消" onClick={()=>setShowAddJudge(false)} secondary/>
            <Btn label="加入" onClick={addJudge} disabled={!nJudgeName.trim()}/>
          </div>
        </Modal>
      )}

      {/* FAB */}
      {page==="home" && (
        <div style={{ position:"fixed", bottom:24, right:20, display:"flex", flexDirection:"column", gap:10, zIndex:20 }}>
          {tab==="blend"&&(
            <button onClick={()=>setShowAddBlend(true)} style={{ width:52,height:52,borderRadius:26,border:"none",background:"linear-gradient(135deg,#1a2a3a,#2c4050)",color:"#e6f0e6",fontSize:22,cursor:"pointer",boxShadow:"0 6px 18px rgba(28,40,60,.45)",display:"flex",alignItems:"center",justifyContent:"center" }}>＋</button>
          )}
          {tab==="batch"&&(
            <button onClick={()=>setShowAddBatch(true)} style={{ width:52,height:52,borderRadius:26,border:"none",background:"linear-gradient(135deg,#2c4a32,#3d6b50)",color:"#e6f0e6",fontSize:22,cursor:"pointer",boxShadow:"0 6px 18px rgba(44,74,50,.45)",display:"flex",alignItems:"center",justifyContent:"center" }}>＋</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Micro components ─────────────────────────────────────────────────────────

const card = { background:"rgba(255,255,255,.7)", borderRadius:14, padding:14, marginBottom:12, boxShadow:"0 1px 10px rgba(30,20,10,.07)" };
const inputStyle = { width:"100%", padding:"10px 12px", borderRadius:10, border:"1px solid #d0c8be", fontSize:"16px", fontFamily:"serif", background:"rgba(255,255,255,.7)", color:"#251a10", boxSizing:"border-box", outline:"none" };
const outlineBtn = { width:"100%", padding:"12px", borderRadius:11, border:"1.5px solid #d0c8be", background:"transparent", color:"#5a6a58", fontSize:14, cursor:"pointer", fontFamily:"serif" };
const btnSm = { padding:"6px 12px", borderRadius:16, fontSize:12, cursor:"pointer", fontFamily:"serif" };

function Lbl({ children }) {
  return <div style={{ fontSize:11, color:"#6aab82", letterSpacing:3, marginBottom:5, textTransform:"uppercase" }}>{children}</div>;
}

function Btn({ label, onClick, secondary, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex:1, width:secondary?undefined:"100%", padding:"14px 12px", borderRadius:12,
      border:secondary?"1.5px solid #c0b8ae":"none",
      background:secondary?"rgba(255,255,255,.6)":disabled?"#c8c0b8":"linear-gradient(135deg,#2c4a32,#3d6b50)",
      color:secondary?"#5c4e40":disabled?"#9a9090":"#e6f0e6",
      fontSize:15, cursor:disabled?"not-allowed":"pointer", fontFamily:"serif", letterSpacing:1,
      boxShadow:(!secondary&&!disabled)?"0 3px 12px rgba(44,74,50,.3)":"none",
    }}>{label}</button>
  );
}

function MInput({ label, val, set, ph, type="text" }) {
  return (
    <div style={{ marginBottom:12 }}>
      <Lbl>{label}</Lbl>
      <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={inputStyle}/>
    </div>
  );
}

function Modal({ onClose, title, children }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(10,20,10,.6)",zIndex:50,display:"flex",alignItems:"flex-end" }} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ background:"#f5f0ea",borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",width:"100%",maxWidth:480,margin:"0 auto",boxSizing:"border-box",maxHeight:"88vh",overflowY:"auto" }}>
        <div style={{ fontSize:16,color:"#2c4a32",fontWeight:"bold",marginBottom:16 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div style={{ textAlign:"center",padding:"60px 20px",color:"#9a8a7a",fontSize:14 }}>
      <div style={{ fontSize:44,marginBottom:12 }}>🫖</div>
      {msg}
    </div>
  );
}
