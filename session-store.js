import { deckSignature } from './coach-engine.js';

const key=deck=>`study:session:${deck.id}`;
const signature=deck=>JSON.stringify([deckSignature(deck),!!deck.coach?.enabled,deck.coach?.deadline||null]);
export function clearSession(deck,storage) {try {(storage??globalThis.localStorage)?.removeItem(key(deck));} catch {}}
export function saveSession(deck,draft,storage) {
  try {
    storage??=globalThis.localStorage;
    const {resume,...config}=draft.config;
    storage?.setItem(key(deck),JSON.stringify({...draft,config,signature:signature(deck),savedAt:Date.now()}));
  } catch {globalThis.window?.dispatchEvent(new Event('study:save-error'));}
}
export function loadSession(deck,storage) {
  try {
    storage??=globalThis.localStorage;
    const draft=JSON.parse(storage?.getItem(key(deck))||'null');
    if (!draft) return null;
    // Preserve progress when resuming methods that are no longer available.
    if (['gap','hint'].includes(draft.config?.mode)) draft.config.mode='type';
    if (['gap','hint'].includes(draft.feedback?.result?.method)) draft.feedback.result.method='type';
    const ids=new Set(deck.cards.map(card=>card.id));
    const modes=['flip','quiz','type','boolean','adaptive'];
    if (!Number.isFinite(draft.savedAt) || !Array.isArray(draft.attempts) || draft.attempts.some(entry=>!Array.isArray(entry)||entry.length!==2||!ids.has(entry[0])||typeof entry[1]!=='boolean') || !Array.isArray(draft.retries) || draft.retries.some(entry=>!Array.isArray(entry)||!ids.has(entry[0])||!Number.isInteger(entry[1])||entry[1]<0||entry[1]>2) || (draft.feedback && typeof draft.feedback.result?.correct!=='boolean')) {clearSession(deck,storage);return null;}
    if (draft.signature!==signature(deck) || !modes.includes(draft.config?.mode) || typeof draft.id!=='string' || !Array.isArray(draft.queue) || !draft.queue.length || draft.queue.length>10000 || draft.queue.some(id=>!ids.has(id)) || !Number.isInteger(draft.pos) || draft.pos<0 || draft.pos>draft.queue.length || !Array.isArray(draft.attempts) || !Array.isArray(draft.retries) || !Number.isInteger(draft.count) || draft.count<0 || Date.now()-draft.savedAt>14*86400000) {clearSession(deck,storage);return null;}
    return reconcileSession(deck,draft);
  } catch {clearSession(deck,storage);return null;}
}
export function reconcileSession(deck,draft) {
  if (draft.feedback || draft.pos>=draft.queue.length) return draft;
  const card=deck.cards.find(card=>card.id===draft.queue[draft.pos]);
  const recorded=(Array.isArray(card?.reviewHistory)?card.reviewHistory:[]).find(entry=>entry?.attemptId===`${draft.id}:${draft.pos}`);
  if (!recorded) return draft;
  // Recover if the card was saved just before a refresh, before the session snapshot.
  const attempts=new Map(draft.attempts), retries=new Map(draft.retries), queue=[...draft.queue];
  if (!attempts.has(card.id)) attempts.set(card.id,recorded.correct);
  const final=draft.config.coachKind==='final', retryCount=retries.get(card.id)||0;
  if (!final && !recorded.correct && retryCount<2 && draft.config.coachKind!=='revision') {
    retries.set(card.id,retryCount+1); queue.splice(Math.min(queue.length,draft.pos+4),0,card.id);
  }
  const recovered={...draft,queue,count:draft.count+1,attempts:[...attempts],retries:[...retries],pos:draft.pos+(final?1:0),feedback:final?null:{result:{...recorded,method:['gap','hint'].includes(recorded.method)?'type':recorded.method},next:recorded.nextReview||card.next}};
  return final ? reconcileSession(deck,recovered) : recovered;
}
