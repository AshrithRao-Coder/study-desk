import { useState, useEffect, useMemo, useRef } from 'react';
import { reviewPool, assessCardAnswer, normalizeAnswer, markingRules } from './study-engine.js';
import { overallPlan, recommendedMethod, scheduleForDeck, cardMastery } from './coach-engine.js';
import { saveSession, clearSession } from './session-store.js';
import { feedbackMessage } from './feedback.js';

const ink = '#1B2A41', rule = '#C9D5E0', green = '#2E7D7A', red = '#C4553E';
const shuffle = values => {const result = [...values]; for (let i=result.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1)); [result[i],result[j]]=[result[j],result[i]];} return result;};
const answerFor = (card, flip) => flip ? card.q : card.a;
const promptFor = (card, flip) => flip ? card.a : card.q;
const poolFor = (deck,scope) => scope==='hard' ? overallPlan(deck).filter(card=>cardMastery(card).stage==='needsPractice') : reviewPool(deck.cards,scope);
const inputStyle = {font: 'inherit', width: '100%', padding: '12px', border: `1px solid ${rule}`, borderRadius: 8, background: '#fff', color: ink};
const Panel = ({children}) => <div className="review-panel">{children}</div>;
const Button = ({children, selected, ...props}) => <button {...props} className={`study-action${selected ? ' selected' : ''}`}>{children}</button>;
export const METHODS = [
  ['flip', 'Flip the card', 'Recall the answer, flip the card, then check how you did.'],
  ['quiz', 'Multiple choice', 'Pick the answer from four choices.'],
  ['type', 'Type the answer', 'Recall and type the full answer.'],
  ['boolean', 'True or false', 'Decide whether a question and answer belong together.'],
  ['match', 'Matching pairs', 'Match questions to answers in a small board.'],
];
function supported(mode, cards, flip) {
  if (mode === 'match') return cards.length >= 2;
  if (!['quiz', 'boolean'].includes(mode)) return true;
  const minimum = mode === 'quiz' ? 3 : mode === 'boolean' ? 1 : 0;
  return cards.every(card => distinctOptions(card, cards, flip).length >= minimum);
}
function distinctOptions(card, cards, flip) {
  const rules = card.marking;
  const candidates = cards.map(other => answerFor(other, flip)).filter(value => !assessCardAnswer(value, card, flip).correct);
  return candidates.filter((value, i) => candidates.findIndex(other => normalizeAnswer(other, rules) === normalizeAnswer(value, rules)) === i);
}
export function StartReview({deck, onStart}) {
  const [mode, setMode] = useState('flip'), [scope, setScope] = useState('all');
  const [flip, setFlip] = useState(false), [limit, setLimit] = useState(20);
  const pool = poolFor(deck,scope);
  const available = supported(mode, mode === 'match' ? pool : deck.cards, flip);
  return <Panel>
    <h3 className="review-heading">Choose how to study</h3>
    <p className="review-copy">Your answers set the review dates automatically. Missed cards return sooner; remembered cards gradually move further apart.</p>
    <div className="method-grid">{METHODS.map(([id, label, description]) => <button key={id} className={`method-button${mode === id ? ' selected' : ''}`} aria-pressed={mode === id} onClick={() => setMode(id)}>
      <strong>{label}</strong><span>{description}</span>
    </button>)}</div>
    <h4 className="review-subheading">Which cards</h4>
    <div className="review-actions">{[['all', `Overall plan (${deck.cards.length})`], ['due', `Scheduled reviews (${reviewPool(deck.cards).length})`], ['starred', 'Starred'], ['hard', 'Needs lots of practice']].map(([id, label]) => <Button key={id} selected={scope === id} aria-pressed={scope === id} onClick={() => setScope(id)}>{label}</Button>)}</div>
    <p className="review-copy">The overall plan covers the whole deck. You can also focus on scheduled reviews or questions that need more practice.</p>
    <div className="review-options">
      <label><input type="checkbox" checked={flip} onChange={event => setFlip(event.target.checked)} /> Reverse questions and answers</label>
      <label>Cards this session <input aria-label="Cards this session" type="number" min="1" max="1000" value={limit} onChange={event => setLimit(Math.max(1, Math.min(1000, Number(event.target.value) || 20)))} style={{...inputStyle, width: 80}} /></label>
    </div>
    {!available && <p role="status" className="review-copy">{mode === 'quiz' ? 'Multiple choice needs four different answers in this deck.' : mode === 'match' ? 'Matching needs at least two cards with different answers in this selection.' : 'True or false needs at least two different answers in this deck.'}</p>}
    {mode === 'match' && pool.length >= 2 && limit < 2 && <p role="status" className="review-copy">Choose at least two cards for matching.</p>}
    <div className="review-actions"><Button selected disabled={!pool.length || !available || (mode === 'match' && limit < 2)} onClick={() => onStart({mode, scope, flip, limit})}>{pool.length ? `Start — ${Math.min(limit, pool.length)} cards` : 'Nothing due in this selection'}</Button></div>
    {!pool.length && deck.cards.length > 0 && <p className="review-copy">You’re up to date with this selection. Choose Everything for extra practice.</p>}
  </Panel>;
}

function Feedback({result, answer, explanation}) {
  const selfCheck=result.feedbackKind==='self-check' || result.method==='flip';
  const revealed=result.feedbackKind==='revealed';
  const message=feedbackMessage(result);
  return <div className="answer-feedback" role="status" aria-live="polite">
    <strong style={{color: result.correct ? green : selfCheck || revealed ? ink : red}}>{message}</strong>
    <p className="saved-answer">{answer}</p>
    {!result.correct && result.given && <p className="review-copy">Your answer: {result.given}</p>}
    {explanation && <div className="answer-explanation"><strong>Why this answer?</strong><p>{explanation}</p></div>}
  </div>;
}

function Exercise({card, deck, mode, flip, onAnswer, onNext, feedback, finalTest=false}) {
  const answer = answerFor(card, flip), prompt = promptFor(card, flip);
  const [typed, setTyped] = useState('');
  const [revealed,setRevealed]=useState(false);
  const fieldRef = useRef(null);
  const submitted = useRef(false);
  const data = useMemo(() => {
    const others = ['quiz','boolean'].includes(mode) ? distinctOptions(card, deck.cards, flip) : [];
    const isTrue = !others.length || Math.random() < .5;
    return {choices: shuffle([answer, ...shuffle(others).slice(0,3)]),
      isTrue,
      statement: isTrue ? answer : shuffle(others)[0]};
  }, [card.id, mode, flip]);
  const finish = result => {
    if (submitted.current || feedback) return;
    submitted.current = true;
    onAnswer({...result, method: mode, assisted: !!result.assisted || mode==='match'});
  };
  const check = () => {
    if (!typed.trim()) return;
    finish({...assessCardAnswer(typed,card,flip),given:typed});
  };
  useEffect(() => {
    if (mode==='type') fieldRef.current?.focus();
  }, [mode]);
  useEffect(() => {
    if (feedback) fieldRef.current?.blur();
  }, [feedback]);
  return <Panel>
    <p className="exercise-label">{finalTest ? 'Final test · no hints or retries' : METHODS.find(([id]) => id === mode)?.[1]}</p>
    <h3 className="question-text">{prompt}</h3>
    <p className="marking-summary">{markingRules(card.marking).caseSensitive ? 'Case sensitive' : 'Case ignored'} · {markingRules(card.marking).ignoreDiacritics ? 'Accents flexible' : 'Accents required'} · {markingRules(card.marking).ignorePunctuation ? 'Punctuation flexible' : 'Exact punctuation'} · {markingRules(card.marking).allowTypos ? 'Small typos allowed' : 'Exact spelling'} · {markingRules(card.marking).ignoreExtraSpaces ? 'Extra spaces ignored' : 'Exact spacing'}</p>
    {mode === 'boolean' && <p className="proposed-answer">Proposed answer: <strong>{data.statement}</strong></p>}
    {!feedback && <>
      {mode==='flip' && <><p className="review-copy">Recall the answer before flipping. Then say whether you remembered it; the scheduler chooses your next review date.</p><button className="flip-card" type="button" aria-expanded={revealed} aria-label={revealed?'Flip card to show question':'Flip card to show answer'} onClick={()=>setRevealed(value=>!value)}><span className="flip-card-label">{revealed?'Answer':'Question'}</span><span>{revealed?answer:prompt}</span><small>{revealed?'Tap to flip back':'Tap to reveal the answer'}</small></button>{revealed && <div className="review-actions"><Button selected onClick={()=>finish({correct:true,feedbackKind:'self-check'})}>I remembered it</Button><Button onClick={()=>finish({correct:false,feedbackKind:'self-check'})}>I missed it</Button></div>}</>}
      {mode === 'quiz' && <div className="choice-list">{data.choices.map((choice,i) => <Button key={i} onClick={() => finish({correct: choice === answer})}>{choice}</Button>)}</div>}
      {mode === 'boolean' && <div className="review-actions"><Button onClick={() => finish({correct: data.isTrue})}>True</Button><Button onClick={() => finish({correct: !data.isTrue})}>False</Button></div>}
      {mode==='type' && <form className="recall-form" onSubmit={event => {event.preventDefault(); check();}}>
        <label className="review-copy" htmlFor="recall-answer">Type your answer using this question’s marking rules.</label>
        <textarea id="recall-answer" ref={fieldRef} value={typed} onChange={event => setTyped(event.target.value)} onKeyDown={event => {if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {event.preventDefault(); check();}}} style={inputStyle} rows="3" autoComplete="off" spellCheck="false" />
        <button className="study-action selected" type="submit" disabled={!typed.trim()}>Check answer</button>
      </form>}
      {mode!=='flip' && <div className="review-actions"><Button onClick={() => finish({correct:false,feedbackKind:finalTest?'skipped':'revealed'})}>{finalTest?'Skip question': 'Show answer — I don’t know'}</Button></div>}
    </>}
    {feedback && <><Feedback result={feedback.result} answer={answer} next={feedback.next} explanation={card.explanation} /><div className="review-actions"><Button selected onClick={onNext} autoFocus>Continue</Button></div></>}
  </Panel>;
}

function Summary({attempts, count, onEnd, kind, deck}) {
  const values = [...attempts.values()];
  const passed=kind==='final' && values.length===deck.cards.length && values.every(Boolean);
  return <Panel><h3 className="review-heading">{kind==='final'?passed?'Final test passed':'Final test complete':'Session done'}</h3><div className="session-stats"><span><strong>{count}</strong> answers checked</span><span><strong>{values.length ? Math.round(values.filter(Boolean).length / values.length * 100) : 0}%</strong> correct first time</span></div><p className="review-copy">{kind==='final'?passed?'Full marks! This deck is passed. You’ll be offered one daily revision session until your deadline, or indefinitely without one.':'You need 100% to pass. Practise the missed questions, then take a fresh final test.':kind==='revision'?'Daily revision complete. Your results and next review dates are saved.':'Your next review dates are saved. Return to the overall plan to see what to work on next.'}</p>{kind==='final' && !passed && <ul className="card-plan">{deck.cards.filter(card=>attempts.get(card.id)===false).map(card=><li key={card.id}><strong>{card.q}</strong><span>{card.a}</span></li>)}</ul>}<Button selected onClick={onEnd}>Back to deck</Button></Panel>;
}

export function Session(props) {
  return props.config.mode === 'match' ? <MatchingSession {...props} /> : <RecallSession {...props} />;
}
function RecallSession({deck, config, onEnd, onPause, patchCard, countReview, onComplete}) {
  const [sessionId]=useState(()=>config.resume?.id || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`));
  const [queue, setQueue] = useState(() => config.resume?.queue || (config.coachKind ? overallPlan(deck) : poolFor(deck,config.scope)).slice(0, config.limit).map(card => card.id));
  const [pos, setPos] = useState(config.resume?.pos||0), [feedback, setFeedback] = useState(config.resume?.feedback||null), [count, setCount] = useState(config.resume?.count||0);
  const attempts = useRef(new Map(config.resume?.attempts||[])), retries = useRef(new Map(config.resume?.retries||[])), answered = useRef(!!config.resume?.feedback), nextLocked = useRef(false);
  const card = deck.cards.find(card => card.id === queue[pos]);
  const finalTest=config.coachKind==='final';
  const method=useMemo(()=>feedback?.result.method || (config.mode==='adaptive' && card ? recommendedMethod(card,deck.cards) : config.mode),[pos]);
  const completed=useRef(false);
  useEffect(()=>{if (!card && !completed.current) {completed.current=true; clearSession(deck); onComplete?.(attempts.current);}},[card]);
  useEffect(() => {answered.current = !!feedback; nextLocked.current = false;}, [pos]);
  useEffect(()=> {
    if (card) saveSession(deck,{id:sessionId,config,queue,pos,feedback,count,attempts:[...attempts.current],retries:[...retries.current]});
  },[queue,pos,feedback,count]);
  const answer = result => {
    if (!card || answered.current) return;
    answered.current = true;
    const retryCount = retries.current.get(card.id) || 0;
    const retryScheduled=!result.correct && !finalTest && retryCount<2 && config.coachKind!=='revision';
    result={...result,retryScheduled,...(!result.correct?{sessionMisses:retryCount+1}:{}),attemptId:`${sessionId}:${pos}`, ...(finalTest?{method:'final'}:{})};
    const next = scheduleForDeck(deck,card,result);
    patchCard(card.id, next); if (next!==card) countReview(); setCount(count => count + 1);
    if (!attempts.current.has(card.id)) attempts.current.set(card.id, result.correct);
    if (finalTest) {setPos(pos=>pos+1); return;}
    setFeedback({result, next: next.next});
    if (retryScheduled) {
      retries.current.set(card.id, retryCount + 1);
      setQueue(queue => {const updated = [...queue]; updated.splice(Math.min(updated.length, pos + 4), 0, card.id); return updated;});
    }
  };
  const next = () => {
    if (!answered.current || nextLocked.current) return;
    nextLocked.current = true;
    setFeedback(null); setPos(pos => pos + 1);
  };
  useEffect(() => {
    const handle = event => {
      if (event.repeat || !feedback || event.key !== 'Enter' || /^(INPUT|TEXTAREA|BUTTON)$/.test(event.target.tagName)) return;
      event.preventDefault(); next();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [feedback, pos]);
  if (!card) return <Summary attempts={attempts.current} count={count} onEnd={onEnd} kind={config.coachKind} deck={deck} />;
  return <div className="review-session">
    <div className="session-toolbar"><progress aria-label="Session progress" value={pos} max={queue.length} /><span>{pos + 1} / {queue.length}</span><Button onClick={onPause}>Pause</Button><Button onClick={onEnd}>End</Button></div>
    <Exercise key={`${pos}:${card.id}`} card={card} deck={deck} mode={method} flip={config.flip} onAnswer={answer} feedback={feedback} onNext={next} finalTest={finalTest} />
    <p className="review-copy">{finalTest?'Every question is asked once. Results appear after the last question.':config.coachKind==='revision'?'One pass through every question for daily revision.':'Answers are saved as soon as they’re checked. Missed cards get up to two extra tries, with other cards in between where possible.'}</p>
  </div>;
}

function MatchingSession({deck, config, onEnd, patchCard, countReview}) {
  const [ids] = useState(() => poolFor(deck,config.scope).slice(0, config.limit).map(card => card.id));
  const [offset, setOffset] = useState(0), [count, setCount] = useState(0);
  const attempts = useRef(new Map());
  // Avoid a final one-pair board by including it with the preceding group.
  const size = ids.length - offset === 5 ? 5 : 4;
  const group = ids.slice(offset, offset + size).map(id => deck.cards.find(card => card.id === id)).filter(Boolean);
  const record = (card, correct) => {
    if (attempts.current.has(card.id)) return;
    attempts.current.set(card.id, correct);
    patchCard(card.id, scheduleForDeck(deck,card,{correct,assisted:true,method:'match'}));
    countReview(); setCount(count => count + 1);
  };
  if (!group.length) return <Summary attempts={attempts.current} count={count} onEnd={onEnd} />;
  return <div className="review-session"><div className="session-toolbar"><span>{offset} / {ids.length} cards matched</span><Button onClick={onEnd}>End</Button></div><MatchBoard key={offset} cards={group} flip={config.flip} onAttempt={record} onNext={() => setOffset(offset => offset + group.length)} /></div>;
}
function MatchBoard({cards, flip, onAttempt, onNext}) {
  const [right] = useState(() => shuffle(cards));
  const [selected, setSelected] = useState(null), [leftDone, setLeftDone] = useState([]), [rightDone, setRightDone] = useState([]);
  const [message, setMessage] = useState('Choose a question on the left, then its answer on the right.');
  const locked = useRef(false);
  const usedLeft = useRef(new Set()), usedRight = useRef(new Set());
  const pair = other => {
    if (!selected || usedLeft.current.has(selected.id) || usedRight.current.has(other.id)) return;
    // Only interchangeable canonical answers can swap, preserving a solvable board.
    const correct = selected.id === other.id || (JSON.stringify(markingRules(selected.marking))===JSON.stringify(markingRules(other.marking)) && normalizeAnswer(answerFor(other,flip),selected.marking)===normalizeAnswer(answerFor(selected,flip),selected.marking));
    onAttempt(selected, correct);
    if (correct) {
      usedLeft.current.add(selected.id); usedRight.current.add(other.id);
      setLeftDone(values => [...values, selected.id]); setRightDone(values => [...values, other.id]); setSelected(null);
      setMessage('Matched. Choose another pair.');
    } else setMessage('Those don’t match. Try a different answer. This question will be reviewed tomorrow.');
  };
  return <Panel><h3 className="review-heading">Matching pairs</h3><p className="review-copy" role="status">{leftDone.length === cards.length ? 'All pairs matched. Review dates saved.' : message}</p><div className="match-board"><div>{cards.map(card => <Button key={card.id} selected={selected?.id === card.id} aria-pressed={selected?.id === card.id} disabled={leftDone.includes(card.id)} onClick={() => setSelected(card)}>{promptFor(card, flip)}{leftDone.includes(card.id) ? ' ✓' : ''}</Button>)}</div><div>{right.map(card => <Button key={card.id} disabled={!selected || rightDone.includes(card.id)} onClick={() => pair(card)}>{answerFor(card, flip)}{rightDone.includes(card.id) ? ' ✓' : ''}</Button>)}</div></div>{leftDone.length === cards.length && <Button selected onClick={() => {if (!locked.current) {locked.current = true; onNext();}}}>Continue</Button>}</Panel>;
}
