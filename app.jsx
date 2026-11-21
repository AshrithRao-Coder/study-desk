import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { StartReview, Session } from "./review.jsx";
import { MarkingSettings } from "./marking-settings.jsx";
import { markingRules, isDateKey } from "./study-engine.js";
import { cardMastery, masteryCounts, STAGES, STAGE_LABELS, finishCoachSession } from "./coach-engine.js";
import { CoachPlan } from "./coach.jsx";
import { Progress, STAGE_COLOURS } from "./progress.jsx";
import { serializeCards, parseCardLines } from "./card-format.js";
import { loadSession, clearSession } from "./session-store.js";

/* ── tokens ───────────────────────────────────────────────────────────── */
const C = {
  paper: "#EDF1F5", card: "#FFFFFF", ink: "#1B2A41", inkSoft: "#5C6B80",
  rule: "#C9D5E0", mark: "#F2C14E", done: "#2E7D7A", late: "#C4553E",
};
const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
const SANS = "'Segoe UI',system-ui,-apple-system,sans-serif";

/* ── storage (plain localStorage — works offline, stays on the device) ── */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { window.dispatchEvent(new Event("study:save-error")); console.error("Couldn't save", e); }
  },
};

/* ── helpers ──────────────────────────────────────────────────────────── */
const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uid = () => Math.random().toString(36).slice(2, 10);
const TODAY = () => iso(new Date());

/* Cards and saved progress. Scheduling lives in study-engine.js. */
const newCard = (q, a, tags = [], marking = {}, acceptedAnswers = [], explanation = '') => ({
  id: uid(), q, a, tags, ease: 2.5, interval: 0, reps: 0, lapses: 0,
  next: TODAY(), starred: false, seen: 0, right: 0,
  marking: markingRules(marking), acceptedAnswers: acceptedAnswers.map(answer => answer.trim()).filter(Boolean),
  explanation,
});
const stage = c => cardMastery(c).stage;
const STAGE_COLOUR = STAGE_COLOURS;
const isDue = (c) => !c.next || c.next <= TODAY();
const isLeech = (c) => (c.lapses || 0) >= 5;

/* ── UI atoms ─────────────────────────────────────────────────────────── */
const Btn = ({ children, onClick, tone = "ink", small, disabled, wide }) => (
  <button onClick={onClick} disabled={disabled}
    className={`rounded-md border font-medium transition-colors ${small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"} ${wide ? "flex-1" : ""} ${disabled ? "opacity-40" : ""}`}
    style={{
      fontFamily: SANS,
      background: tone === "ink" ? C.ink : tone === "mark" ? C.mark : tone === "done" ? C.done : "transparent",
      color: tone === "ink" || tone === "done" ? "#fff" : C.ink,
      borderColor: tone === "ghost" ? C.rule : "transparent",
    }}>{children}</button>
);
const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs" style={{ color: C.inkSoft, fontFamily: SANS }}>{label}</span>
    {children}
  </label>
);
const inputStyle = { fontFamily: SANS, fontSize: 16, color: C.ink, background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6, padding: "8px 10px", width: "100%" };
const Panel = ({ children, className = "" }) => (
  <div className={`rounded-lg p-4 ${className}`} style={{ background: C.card, border: `1px solid ${C.rule}` }}>{children}</div>
);
const Stat = ({ value, label, big }) => (
  <div>
    <p style={{ fontFamily: SERIF, fontSize: big ? 26 : 20, lineHeight: 1 }}>{value}</p>
    <p className="mt-0.5 text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>{label}</p>
  </div>
);
const MasteryBar = ({ counts, total }) => (
  <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded" style={{ background: C.paper }}>
    {STAGES.map((k) =>
      counts[k] ? <div key={k} style={{ width: `${(counts[k] / Math.max(1, total)) * 100}%`, background: STAGE_COLOUR[k] }} /> : null
    )}
  </div>
);

/* ── app ──────────────────────────────────────────────────────────────── */
function StudyDesk() {
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const failed = () => setSaveError(true);
    window.addEventListener("study:save-error", failed);
    return () => window.removeEventListener("study:save-error", failed);
  }, []);
  const [decks, setDecks] = useState(() =>
    (Array.isArray(store.get("study:decks", [])) ? store.get("study:decks", []) : []).filter(deck => deck && typeof deck.name === "string").map((deck) => ({
      ...deck,
      cards: (Array.isArray(deck.cards) ? deck.cards : []).filter(c => c && typeof (c.q ?? c.front) === "string" && typeof (c.a ?? c.back) === "string").map((c) => ({ ...newCard("", ""), ...c, marking: markingRules(c.marking), acceptedAnswers: Array.isArray(c.acceptedAnswers) ? c.acceptedAnswers.filter(a => typeof a === "string" && a.trim()) : [], tags: Array.isArray(c.tags) ? c.tags.filter(t => typeof t === "string") : [], q: c.q ?? c.front ?? "", a: c.a ?? c.back ?? "" })),
    }))
  );
  const [stats, setStats] = useState(() => {
    const s = { streak: 0, last: null, todayCount: 0, goal: 20, history: {}, ...store.get("study:stats", {}) };
    if (s.last !== TODAY() && s.last !== iso(addDays(new Date(), -1))) s.streak = 0;
    return s.last === TODAY() ? s : { ...s, todayCount: 0 };
  });
  const [day,setDay]=useState(TODAY);
  useEffect(()=> {
    const refresh=()=>{
      const today=TODAY(),yesterday=iso(addDays(new Date(),-1));setDay(today);
      setStats(previous=> {
        if (previous.last===today) return previous;
        const streak=previous.last===yesterday?previous.streak:0;
        return previous.todayCount===0 && previous.streak===streak ? previous : {...previous,todayCount:0,streak};
      });
    };
    const timer=setInterval(refresh,30000);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[]);

  const putDecks = (v) => { setDecks(v); store.set("study:decks", v); };
  const putStats = (v) => { setStats(v); store.set("study:stats", v); };

  const countReview = useCallback(() => {
    setStats((prev) => {
      const t = TODAY(), y = iso(addDays(new Date(), -1));
      const fresh = prev.last === t
        ? { ...prev, todayCount: prev.todayCount + 1 }
        : { ...prev, todayCount: 1, streak: prev.last === y ? (prev.streak || 0) + 1 : 1 };
      fresh.last = t;
      fresh.history = { ...(prev.history || {}), [t]: (prev.history?.[t] || 0) + 1 };
      store.set("study:stats", fresh);
      return fresh;
    });
  }, []);

  return (
    <div style={{ background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 style={{ fontFamily: SERIF, fontSize: 30, letterSpacing: "-0.01em", lineHeight: 1.1 }}>Study desk</h1>
            <p className="mt-1 text-sm" style={{ fontFamily: SANS, color: C.inkSoft }}>
              {new Date(`${day}T12:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {stats.streak > 0 && (
              <p className="text-right text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>
                {stats.streak} day{stats.streak === 1 ? "" : "s"} running<br />{stats.todayCount}/{stats.goal} cards today
              </p>
            )}
          </div>
        </header>

        {saveError && <p role="alert" style={{padding: 14, border: `1px solid ${C.late}`, borderRadius: 8, marginBottom: 16}}>Your browser could not save these changes. Return to All decks and download a library backup before closing this page.</p>}
        <CardView decks={decks} putDecks={putDecks} stats={stats} putStats={putStats} countReview={countReview} />
      </div>
    </div>
  );
}

/* ── deck shelf ───────────────────────────────────────────────────────── */
function LibraryBackup({ decks, putDecks, stats, putStats }) {
  const fileRef = useRef(null);
  const [message, setMessage] = useState("");
  const download = () => {
    const blob = new Blob([JSON.stringify({ format: "study-desk", version: 1, decks, stats }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `study-desk-${TODAY()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Backup downloaded, including all decks and review progress.");
  };
  const restore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a backup smaller than 10 MB.");
      const data = JSON.parse(await file.text());
      if (data.format !== "study-desk" || data.version !== 1 || !Array.isArray(data.decks) || !data.stats || typeof data.stats !== "object" || Array.isArray(data.stats)) throw new Error("This is not a Study desk library backup.");
      const deckIds = new Set(), cardIds = new Set();
      for (const deck of data.decks) {
        if (!deck || typeof deck.id !== "string" || deckIds.has(deck.id) || typeof deck.name !== "string" || !deck.name.trim() || !Array.isArray(deck.cards)) throw new Error("A deck in this backup is invalid.");
        deckIds.add(deck.id);
        if (deck.coach!=null && (typeof deck.coach!=='object' || Array.isArray(deck.coach) || (deck.coach.enabled!=null && typeof deck.coach.enabled!=='boolean') || (deck.coach.deadline && !isDateKey(deck.coach.deadline)))) throw new Error('A deck’s coach settings are invalid.');
        for (const card of deck.cards) {
          if (!card || typeof card.id !== "string" || cardIds.has(card.id) || typeof card.q !== "string" || !card.q.trim() || typeof card.a !== "string" || !card.a.trim() || !Array.isArray(card.tags) || card.tags.some(t => typeof t !== "string")) throw new Error("A card in this backup is invalid.");
          cardIds.add(card.id);
          for (const key of ["ease", "interval", "reps", "lapses", "seen", "right"]) if (!Number.isFinite(card[key]) || card[key] < 0) throw new Error("Review progress in this backup is invalid.");
          if (card.right>card.seen || ['reps','lapses','seen','right','interval'].some(key=>!Number.isInteger(card[key])) || card.interval>365) throw new Error('Review counts in this backup are invalid.');
          if (!isDateKey(card.next)) throw new Error("A review date in this backup is invalid.");
          if (card.marking != null && (typeof card.marking !== "object" || Array.isArray(card.marking) || Object.keys(markingRules()).some(key => key in card.marking && typeof card.marking[key] !== "boolean"))) throw new Error("A question's marking rules are invalid.");
          if (card.acceptedAnswers != null && (!Array.isArray(card.acceptedAnswers) || card.acceptedAnswers.some(answer => typeof answer !== "string"))) throw new Error("An accepted answer in this backup is invalid.");
          if (card.explanation!=null && typeof card.explanation!=='string') throw new Error('A card explanation in this backup is invalid.');
          if (card.reviewHistory!=null && (!Array.isArray(card.reviewHistory) || card.reviewHistory.some(entry=>!entry || !isDateKey(entry.day) || typeof entry.correct!=='boolean'))) throw new Error('A card’s review history in this backup is invalid.');
        }
      }
      const restoredStats = { ...data.stats, goal: Math.max(5, Math.min(1000, Number(data.stats.goal) || 20)), todayCount: data.stats.last === TODAY() ? Math.max(0, Number(data.stats.todayCount) || 0) : 0, streak: data.stats.last === TODAY() || data.stats.last === iso(addDays(new Date(), -1)) ? Math.max(0, Number(data.stats.streak) || 0) : 0 };
      if (!confirm(`Restore ${data.decks.length} decks and their review progress? This replaces the current library. Download a backup first if you want to keep it.`)) return;
      putDecks(data.decks); putStats(restoredStats);
      setMessage(`Restored ${data.decks.length} decks and ${cardIds.size} cards.`);
    } catch (error) { setMessage(`Could not restore: ${error.message}`); }
  };
  return <Panel>
    <h2 style={{ fontFamily: SERIF, fontSize: 18 }}>Keep your work safe</h2>
    <p className="mt-1 text-sm" style={{ color: C.inkSoft }}>Save all your decks, topics and review progress to a file, or restore them on another device.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Btn small onClick={download} disabled={!decks.length}>Download library backup</Btn>
      <Btn small tone="ghost" onClick={() => fileRef.current?.click()}>Restore backup</Btn>
      <input ref={fileRef} hidden type="file" accept="application/json,.json" aria-label="Choose a Study desk backup" onChange={restore} />
    </div>
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </Panel>;
}

function CardView({ decks, putDecks, stats, putStats, countReview }) {
  const [activeId, setActiveId] = useState(null);
  const [name, setName] = useState("");
  const [query,setQuery]=useState(''), [sort,setSort]=useState('original'), [deletedDeck,setDeletedDeck]=useState(null);
  const active = decks.find((d) => d.id === activeId);

  const addDeck = () => {
    if (!name.trim()) return;
    const d = { id: uid(), name: name.trim(), cards: [] };
    putDecks([...decks, d]); setName(""); setActiveId(d.id);
  };
  const updateDeck = (d) => putDecks(decks.map((x) => (x.id === d.id ? d : x)));

  if (active) return (
    <Deck deck={active} updateDeck={updateDeck} countReview={countReview}
      onBack={() => setActiveId(null)}
      onDelete={() => { setDeletedDeck(active);clearSession(active);putDecks(decks.filter((d) => d.id !== active.id)); setActiveId(null); }} />
  );

  const allCards = decks.flatMap((d) => d.cards);
  const dueAll = allCards.filter(isDue).length;
  const visible=decks.filter(deck=>`${deck.name} ${deck.cards.flatMap(card=>card.tags||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  if (sort==='name') visible.sort((a,b)=>a.name.localeCompare(b.name));
  if (sort==='due') visible.sort((a,b)=>b.cards.filter(isDue).length-a.cards.filter(isDue).length);

  return (
    <div className="space-y-4">
      {deletedDeck && <Panel><p role="status">Deleted “{deletedDeck.name}”.</p><Btn small tone="ghost" onClick={()=>{if (!decks.some(deck=>deck.id===deletedDeck.id)) putDecks([...decks,deletedDeck]);setDeletedDeck(null);}}>Undo deck deletion</Btn></Panel>}
      {allCards.length > 0 && (
        <Panel>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Stat big value={dueAll} label="due now" />
            <Stat big value={allCards.length} label="cards in total" />
            <Stat big value={allCards.filter((c) => stage(c) === "mature").length} label="known well" />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>daily goal</span>
              <input type="number" min="5" step="5" value={stats.goal}
                aria-label="Daily review goal" onChange={(e) => putStats({ ...stats, goal: Math.max(5, Math.min(1000, Number(e.target.value) || 20)) })}
                style={{ ...inputStyle, width: 70 }} />
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded" style={{ background: C.paper }}>
            <div style={{ width: `${Math.min(100, (stats.todayCount / Math.max(1, stats.goal)) * 100)}%`, height: "100%", background: C.done }} />
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex gap-2">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDeck()} placeholder="New deck — e.g. Biology: cells" />
          <Btn onClick={addDeck} disabled={!name.trim()}>Create</Btn>
        </div>
      </Panel>

      {!!decks.length && <Panel><div className="library-search"><input aria-label="Search decks" style={inputStyle} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search decks or topics" /><label>Sort <select aria-label="Sort decks" style={inputStyle} value={sort} onChange={event=>setSort(event.target.value)}><option value="original">Original order</option><option value="name">Name</option><option value="due">Most to review</option></select></label></div>{!!query && <p className="review-copy">{visible.length} of {decks.length} decks shown.</p>}</Panel>}
      <LibraryBackup decks={decks} putDecks={putDecks} stats={stats} putStats={putStats} />

      {decks.length === 0 ? (
        <p className="text-sm" style={{ fontFamily: SANS, color: C.inkSoft }}>No decks yet. Make one above, then add questions and answers.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {visible.map((d) => {
            const due = d.cards.filter(isDue).length;
            const counts = masteryCounts(d.cards);
            return (
              <button key={d.id} onClick={() => setActiveId(d.id)} className="rounded-lg p-4 text-left" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                <p style={{ fontFamily: SERIF, fontSize: 17 }}>{d.name}</p>
                <p className="mt-1 text-xs" style={{ fontFamily: SANS, color: due ? C.ink : C.inkSoft }}>
                  {d.cards.length} cards · {due ? `${due} to review` : "all caught up"}
                </p>
                <MasteryBar counts={counts} total={d.cards.length} />
              </button>
            );
          })}
        </div>
      )}
      {!!decks.length && !visible.length && <p role="status" className="review-copy">No decks match that search.</p>}
    </div>
  );
}

/* ── one deck ─────────────────────────────────────────────────────────── */
function Deck({ deck, updateDeck, onBack, onDelete, countReview }) {
  const [view, setView] = useState("review");
  const [session, setSession] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(deck.name);

  const setCards = (cards, resetCoach=false) => {
    const existing=new Map(deck.cards.map(card=>[card.id,card]));
    const content=card=>JSON.stringify([card.q,card.a,markingRules(card.marking),card.acceptedAnswers||[]]);
    const nextCards=cards.map(card=>{
      const old=existing.get(card.id);
      return old && content(old)!==content(card) ? {...newCard(card.q,card.a,card.tags,card.marking,card.acceptedAnswers||[],card.explanation||''),id:card.id,starred:card.starred} : card;
    });
    if (resetCoach) clearSession(deck);
    updateDeck({ ...deck, cards:nextCards, ...(resetCoach?{coach:{...deck.coach,passedAt:null,passedSignature:null,lastTest:null,lastRevisionDay:null,guideStep:0,lastGuidedMethod:null}}:{}) });
  };
  const patchCard = (id, patch) => setCards(deck.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const startSession=config=>{clearSession(deck);setSession(config);};

  const draft=loadSession(deck);
  if (session) return <Session deck={deck} config={session} onEnd={() => {clearSession(deck);setSession(null);}} onPause={()=>setSession(null)} patchCard={patchCard} countReview={countReview} onComplete={attempts => {if (session.coachKind) updateDeck({...deck,coach:finishCoachSession(deck,session.coachKind,attempts,new Date(),session)});}} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Btn tone="ghost" small onClick={onBack}>All decks</Btn>
        {renaming ? (
          <>
            <input style={inputStyle} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            <Btn small onClick={() => { updateDeck({ ...deck, name: nameDraft.trim() || deck.name }); setRenaming(false); }}>Save</Btn>
          </>
        ) : (
          <>
            <h2 className="flex-1 truncate" style={{ fontFamily: SERIF, fontSize: 20 }}>{deck.name}</h2>
            <Btn tone="ghost" small onClick={() => setRenaming(true)}>Rename</Btn>
          </>
        )}
        <Btn tone="ghost" small onClick={() => { if (confirm(`Delete "${deck.name}" and its ${deck.cards.length} cards?`)) onDelete(); }}>Delete</Btn>
      </div>

      <div className="flex flex-wrap gap-2">
        {[["review", "Review"], ["cards", `Cards (${deck.cards.length})`], ["add", "Add"], ["stats", "Progress"], ["io", "Import / export"]].map(([k, l]) => (
          <Btn key={k} small tone={view === k ? "ink" : "ghost"} onClick={() => setView(k)}>{l}</Btn>
        ))}
      </div>

      {view === "review" && <>{draft && <Panel><h3 style={{fontSize:18}}>Pick up where you left off</h3><p className="review-copy">{draft.count} answers checked. Your unfinished session is saved on this device.</p><Btn onClick={()=>setSession({...draft.config,resume:draft})}>Resume session</Btn> <Btn tone="ghost" onClick={()=>{clearSession(deck);setView('review');updateDeck({...deck});}}>Discard saved session</Btn></Panel>}<CoachPlan deck={deck} updateDeck={updateDeck} onStart={startSession} />{!deck.coach?.enabled && <StartReview deck={deck} onStart={startSession} />}</>}
      {view === "cards" && <CardList deck={deck} setCards={setCards} patchCard={patchCard} />}
      {view === "add" && <AddCards deck={deck} setCards={setCards} />}
      {view === "stats" && <Progress deck={deck} />}
      {view === "io" && <ImportExport deck={deck} setCards={setCards} />}
    </div>
  );
}

function CardList({ deck, setCards, patchCard }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState(null);
  const [deletedCard,setDeletedCard]=useState(null);
  const [draft, setDraft] = useState({ q: "", a: "", tags: "", marking: markingRules(), acceptedAnswers: [] });

  const tags = [...new Set(deck.cards.flatMap((c) => c.tags || []))];
  const shown = deck.cards.filter((c) =>
    (!q || (c.q + " " + c.a).toLowerCase().includes(q.toLowerCase())) &&
    (!tag || (c.tags || []).includes(tag))
  );

  const startEdit = (c) => { setEditing(c.id); setDraft({ q: c.q, a: c.a, tags: (c.tags || []).join(", "), explanation:c.explanation||'', marking: markingRules(c.marking), acceptedAnswers: c.acceptedAnswers || [] }); };
  const saveEdit = () => {
    if (!draft.q.trim() || !draft.a.trim()) return;
    patchCard(editing, { q: draft.q.trim(), a: draft.a.trim(), explanation:(draft.explanation||'').trim(), tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean), marking: markingRules(draft.marking), acceptedAnswers: draft.acceptedAnswers.map(a => a.trim()).filter(Boolean) });
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <input style={{ ...inputStyle, flex: 1, minWidth: 160 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions and answers" />
          {tags.length > 0 && (
            <select style={{ ...inputStyle, width: "auto" }} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All topics</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
        {shown.length !== deck.cards.length && (
          <p className="mt-2 text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>{shown.length} of {deck.cards.length} shown</p>
        )}
      </Panel>

      {deck.cards.length === 0 && <p className="text-sm" style={{ fontFamily: SANS, color: C.inkSoft }}>Empty deck. Add some cards.</p>}

      <ul className="space-y-1">
        {shown.map((c) => (
          <li key={c.id} className="rounded-lg p-3" style={{ background: C.card, border: `1px solid ${isLeech(c) ? C.late + "66" : C.rule}` }}>
            {editing === c.id ? (
              <div className="space-y-2">
                <Field label="Question"><textarea style={{ ...inputStyle, minHeight: 54 }} value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></Field>
                <Field label="Answer"><textarea style={{ ...inputStyle, minHeight: 54 }} value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value })} /></Field>
                <Field label="Why is this correct? (optional)"><textarea style={inputStyle} value={draft.explanation||''} onChange={event=>setDraft({...draft,explanation:event.target.value})} placeholder="An explanation, example or memory aid" /></Field>
                <Field label="Topics, separated by commas"><input style={inputStyle} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></Field>
                <MarkingSettings value={draft.marking} onChange={marking => setDraft({...draft, marking})} alternatives={draft.acceptedAnswers} onAlternativesChange={acceptedAnswers => setDraft({...draft, acceptedAnswers})} />
                <p className="review-copy">Changing the question, answer or marking rules starts this card’s learning progress again.</p>
                <div className="flex gap-2"><Btn small onClick={saveEdit} disabled={!draft.q.trim() || !draft.a.trim()}>Save card</Btn><Btn small tone="ghost" onClick={() => setEditing(null)}>Cancel</Btn></div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={{ fontFamily: SANS }}>{c.q}</p>
                  <p className="mt-0.5 text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>{c.a}</p>
                  <p className="mt-1 text-[11px]" style={{ fontFamily: SANS, color: C.inkSoft }}>
                    <span style={{ color: STAGE_COLOUR[stage(c)] === C.rule ? C.inkSoft : STAGE_COLOUR[stage(c)] }}>{STAGE_LABELS[stage(c)]} · {cardMastery(c).score}% mastery</span>
                    {c.seen ? ` · ${Math.round((c.right / c.seen) * 100)}% right` : ""}
                    {c.seen ? ` · next ${c.next}` : ""}
                    {isLeech(c) ? " · keeps slipping, try rewording it" : ""}
                    {(c.tags || []).length ? ` · ${c.tags.join(", ")}` : ""}
                  </p>
                </div>
                <button aria-label={`${c.starred?'Unstar':'Star'} ${c.q}`} onClick={() => patchCard(c.id, { starred: !c.starred })} className="text-sm" style={{ color: c.starred ? C.mark : C.rule }}>★</button>
                <button onClick={() => startEdit(c)} className="text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>edit</button>
                <button aria-label={`Delete ${c.q}`} onClick={() => {setDeletedCard({card:c,index:deck.cards.findIndex(card=>card.id===c.id)});setCards(deck.cards.filter((x) => x.id !== c.id));}} className="text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>×</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {deletedCard && <Panel><p role="status">Deleted “{deletedCard.card.q}”.</p><Btn small tone="ghost" onClick={()=>{if (!deck.cards.some(card=>card.id===deletedCard.card.id)) {const restored=[...deck.cards];restored.splice(Math.min(deletedCard.index,restored.length),0,deletedCard.card);setCards(restored);}setDeletedCard(null);}}>Undo card deletion</Btn></Panel>}
    </div>
  );
}

/* ── add cards ────────────────────────────────────────────────────────── */
function AddCards({ deck, setCards }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [tags, setTags] = useState("");
  const [bulk, setBulk] = useState("");
  const [marking, setMarking] = useState(() => markingRules());
  const [acceptedAnswers, setAcceptedAnswers] = useState([]);
  const [explanation,setExplanation]=useState('');
  const [msg, setMsg] = useState("");
  const qRef = useRef(null);

  const add = () => {
    if (!q.trim() || !a.trim()) return;
    setCards([...deck.cards, newCard(q.trim(), a.trim(), tags.split(",").map((t) => t.trim()).filter(Boolean), marking, acceptedAnswers,explanation.trim())]);
    setQ(""); setA(""); setAcceptedAnswers([]);setExplanation(''); setMsg("Added. Next one.");
    qRef.current?.focus();
  };

  const addBulk = () => {
    try {
      const rows = parseCardLines(bulk, {marking, tags:tags.split(",").map(tag=>tag.trim()).filter(Boolean)});
      setCards([...deck.cards,...rows.map(row=>newCard(row.q,row.a,row.tags,row.marking,row.acceptedAnswers,row.explanation||''))]);
      setBulk(""); setMsg(`Added ${rows.length} cards.`);
    } catch (error) {setMsg(error.message);}
  };

  return (
    <div className="space-y-3">
      <Panel>
        <h3 className="mb-2" style={{ fontFamily: SERIF, fontSize: 18 }}>One at a time</h3>
        <div className="space-y-2">
          <Field label="Question"><textarea ref={qRef} style={{ ...inputStyle, minHeight: 54 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What does the mitochondrion do?" /></Field>
          <Field label="Answer"><textarea style={{ ...inputStyle, minHeight: 54 }} value={a} onChange={(e) => setA(e.target.value)} placeholder="Releases energy from glucose in respiration" /></Field>
          <Field label="Why is this correct? (optional)"><textarea style={inputStyle} value={explanation} onChange={event=>setExplanation(event.target.value)} placeholder="Add an explanation, example or memory aid to show after answering" /></Field>
          <Field label="Topic tags, separated by commas (optional)"><input style={inputStyle} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cells, respiration" /></Field>
          <MarkingSettings value={marking} onChange={setMarking} alternatives={acceptedAnswers} onAlternativesChange={setAcceptedAnswers} />
          <Btn onClick={add} disabled={!q.trim() || !a.trim()}>Add card</Btn>
        </div>
      </Panel>

      <Panel>
        <h3 className="mb-1" style={{ fontFamily: SERIF, fontSize: 18 }}>A whole list at once</h3>
        <p className="mb-2 text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>
          One card per line: question | answer. Add |(settings) to preserve question-specific rules. Tabs, commas, semicolons and " - " also work for simple lists.
        </p>
        <p className="review-copy">Uses the settings above unless a line supplies its own |(settings). Other accepted answers entered above apply only to the single-card form.</p>
        <textarea style={{ ...inputStyle, minHeight: 120, fontFamily: "ui-monospace, monospace", fontSize: 13 }} value={bulk} onChange={(e) => setBulk(e.target.value)}
          placeholder={"capital of Peru - Lima\n1066 - Battle of Hastings"} />
        <div className="mt-2"><Btn onClick={addBulk}>Add them all</Btn></div>
      </Panel>

      {msg && <p className="text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>{msg}</p>}
    </div>
  );
}

/* ── progress ─────────────────────────────────────────────────────────── */
function ImportExport({ deck, setCards }) {
  const text = serializeCards(deck.cards);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const importFile=useRef(null);
  const preview=useMemo(()=>{if (!paste.trim()) return null;try {return {count:parseCardLines(paste).length};} catch(error) {return {error:error.message};}},[paste]);
  const downloadDeck=()=>{
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=`${deck.name.replace(/[<>:"/\\|?*]/g,'-').slice(0,80)||'study-deck'}.txt`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg("Copied to the clipboard."); }
    catch { setMsg("Copy didn't work here — select the text and copy it manually."); }
  };
  const importIn = () => {
    try {
      const rows = parseCardLines(paste);
      setCards([...deck.cards,...rows.map(row=>newCard(row.q,row.a,row.tags,row.marking,row.acceptedAnswers,row.explanation||''))]);
      setPaste(""); setMsg(`Brought in ${rows.length} cards, including their marking rules.`);
    } catch (error) {setMsg(error.message);}
  };
  const resetProgress = () => {
    if (!confirm("Reset the review history on every card in this deck? The cards themselves stay.")) return;
    setCards(deck.cards.map((c) => ({ ...newCard(c.q, c.a, c.tags, c.marking, c.acceptedAnswers || [],c.explanation||''), id: c.id, starred: c.starred })),true);
    setMsg("Progress cleared. Everything's due again.");
  };

  return (
    <div className="space-y-3">
      <Panel>
        <h3 className="mb-2" style={{ fontFamily: SERIF, fontSize: 18 }}>Take this deck elsewhere</h3>
        <p className="review-copy">Each line includes the question, answer and |(settings): case, diacritics, punctuation, spelling, spaces, other accepted answers and tags. Copy it into another deck to keep those rules. For coach settings, progress and deadlines, use a library backup.</p>
        {deck.cards.length === 0 ? (
          <div className="flex items-center justify-center rounded" style={{ minHeight: 120, border: `1px dashed ${C.rule}`, fontFamily: SANS, fontSize: 14, color: C.inkSoft }}>
            No Cards Yet
          </div>
        ) : (
          <textarea readOnly style={{ ...inputStyle, minHeight: 120, fontFamily: "ui-monospace, monospace", fontSize: 13 }} value={text} />
        )}
        <div className="review-actions"><Btn onClick={copy} disabled={deck.cards.length === 0}>Copy all cards</Btn><Btn tone="ghost" onClick={downloadDeck} disabled={!deck.cards.length}>Download deck text</Btn></div>
      </Panel>
      <Panel>
        <h3 className="mb-2" style={{ fontFamily: SERIF, fontSize: 18 }}>Bring cards in</h3>
        <p className="review-copy">Use question | answer or add |(caseSensitive=true;ignoreDiacritics=false;ignorePunctuation=true;allowTypos=false;ignoreExtraSpaces=true). Settings use true/false; the full exported format also includes acceptedAnswers and tags as JSON lists.</p>
        <textarea style={{ ...inputStyle, minHeight: 100, fontFamily: "ui-monospace, monospace", fontSize: 13 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="question | answer" />
        <p className="review-copy" role="status">{preview?.error || (preview ? `${preview.count} cards ready to import. Your current cards will be kept.` : 'Paste cards or choose a text file to preview the import.')}</p>
        <div className="review-actions"><Btn onClick={importIn} disabled={!preview || !!preview.error}>Add to this deck</Btn><Btn tone="ghost" onClick={()=>importFile.current?.click()}>Choose text file</Btn><input ref={importFile} type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" hidden aria-label="Choose cards text file" onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if (!file) return;if (file.size>5*1024*1024) {setMsg('Choose a text file smaller than 5 MB.');return;}try {setPaste(await file.text());setMsg('Text loaded. Check the preview before adding the cards.');} catch {setMsg('Could not read that text file.');}}} /></div>
      </Panel>
      <Panel>
        <h3 className="mb-1" style={{ fontFamily: SERIF, fontSize: 18 }}>Start the deck over</h3>
        <p className="mb-2 text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>Useful before an exam if you want everything back in circulation.</p>
        <Btn tone="ghost" onClick={resetProgress}>Reset review history</Btn>
      </Panel>
      {msg && <p className="text-xs" style={{ fontFamily: SANS, color: C.inkSoft }}>{msg}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StudyDesk />);
