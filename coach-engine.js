import { dateKey, markingRules, scheduleReview, reviewPool, isDateKey } from './study-engine.js';

export const STAGES = ['new','needsPractice','learning','young','mature'];
export const STAGE_LABELS = {new:'New', needsPractice:'Needs lots of practice', learning:'Learning', young:'Young', mature:'Mature'};
const dayNumber = key => {const [year,month,day] = key.split('-').map(Number); return Date.UTC(year,month-1,day)/86400000;};
export function cardMastery(card, now = new Date()) {
  const history = (Array.isArray(card.reviewHistory) ? card.reviewHistory : []).filter(entry => entry && typeof entry.correct === 'boolean' && isDateKey(entry.day));
  const recent = history.slice(-8);
  const seen = Number(card.seen) || 0;
  if (!seen && !recent.length) return {score:0, stage:'new', recallDays:0, recallSessions:0, misses:0};
  const misses = recent.length ? recent.filter(entry => !entry.correct).length : Math.max(0, seen-(Number(card.right)||0));
  const recentAccuracy=recent.length ? recent.filter(entry=>entry.correct).length/recent.length : seen ? Math.max(0,Math.min(1,(Number(card.right)||0)/seen)) : 0;
  const evidenceKey=entry=>typeof entry.attemptId==='string' && entry.attemptId.lastIndexOf(':')>0
    ? `session:${entry.attemptId.slice(0,entry.attemptId.lastIndexOf(':'))}` : `day:${entry.day}`;
  const unaided=entry=>entry.correct && !entry.assisted && ['type','flip','final'].includes(entry.method);
  // Restore strict evidence rules per session, without excluding an entire day.
  const failedSessions=new Set(history.filter(entry=>!entry.correct).map(evidenceKey));
  const recall=history.filter(entry=>unaided(entry) && !failedSessions.has(evidenceKey(entry)));
  const recallDays=new Set(recall.map(entry=>entry.day)).size;
  const recallSessions=new Set(recall.map(evidenceKey)).size;
  const evidence=Math.min(3,recallSessions);
  const strength=Math.min(15,Math.max(0,Number(card.stability ?? card.interval)||0)/2);
  const overdue = isDateKey(card.next) ? Math.max(0,dayNumber(dateKey(now))-dayNumber(card.next)) : 0;
  const decay=Math.min(20,overdue/Math.max(1,Number(card.stability ?? card.interval)||1)*5);
  const score=Math.round(Math.max(0,Math.min(100,recentAccuracy*35 + evidence*15 + Math.min(4,recall.length)*5 + strength - Math.min(30,misses*8) - decay)));
  const struggling=(misses>=2 && recentAccuracy<.7) || (!recent.length && seen>=3 && recentAccuracy<.5);
  const lastMiss=history.findLastIndex(entry=>!entry.correct);
  const recovered=lastMiss<0 || history.slice(lastMiss+1).some(unaided);
  const stage = struggling ? 'needsPractice' : score >= 80 && recallSessions >= 2 && recovered && recent.slice(-2).every(entry=>entry.correct) ? 'mature' : score >= 60 ? 'young' : 'learning';
  return {score,stage,recallDays,recallSessions,misses};
}
export function masteryCounts(cards, now = new Date()) {
  const counts = Object.fromEntries(STAGES.map(stage=>[stage,0]));
  for (const card of cards) counts[cardMastery(card,now).stage]++;
  return counts;
}
export function needsAnotherLook(card) {
  const recent = Array.isArray(card.reviewHistory) ? card.reviewHistory.filter(Boolean).slice(-5) : [];
  return recent.length ? recent.some(entry=>!entry.correct) : !!card.seen && card.right < card.seen;
}
export function deckSignature(deck) {
  return JSON.stringify(deck.cards.map(card=>[card.id,card.q,card.a,markingRules(card.marking),card.acceptedAnswers||[]]));
}
export function coachStatus(deck, now = new Date()) {
  const today = dateKey(now), config = deck.coach || {};
  const counts = masteryCounts(deck.cards,now);
  const passed = !!config.passedAt && config.passedSignature === deckSignature(deck);
  const deadline = isDateKey(config.deadline) ? config.deadline : null;
  const maintenanceEnded = passed && deadline && today > deadline;
  return {counts,passed,deadline,maintenanceEnded,
    ready:deck.cards.length > 0 && counts.mature === deck.cards.length,
    revisionDue:passed && !maintenanceEnded && config.lastRevisionDay !== today,
    daysLeft:deadline ? dayNumber(deadline)-dayNumber(today)+1 : null,
    score:deck.cards.length ? Math.round(deck.cards.reduce((sum,card)=>sum+cardMastery(card,now).score,0)/deck.cards.length) : 0,
  };
}
export function recommendedMethod(card, cards, now = new Date()) {
  const {stage} = cardMastery(card,now);
  if (stage === 'mature' || stage === 'young') return 'type';
  if (stage === 'needsPractice') return 'flip';
  if (stage === 'new') return 'flip';
  // Alternate scaffolded recall and unaided recall as evidence improves.
  return ['gap','hint','flip','quiz','boolean','match'].includes(card.lastMethod) ? 'type' : 'flip';
}
export function overallPlan(deck, now = new Date()) {
  return reviewPool(deck.cards,'all',now).sort((a,b)=> {
    const order = {needsPractice:0,new:1,learning:2,young:3,mature:4};
    return order[cardMastery(a,now).stage]-order[cardMastery(b,now).stage];
  });
}
export function scheduleForDeck(deck, card, result, now = new Date()) {
  const updated = scheduleReview(card,result,now), status = coachStatus(deck,now);
  if (deck.coach?.enabled && status.deadline && status.deadline >= dateKey(now) && updated.next > status.deadline) {
    updated.next = status.deadline;
    updated.interval = Math.max(0,dayNumber(status.deadline)-dayNumber(dateKey(now)));
    updated.reviewHistory[updated.reviewHistory.length-1].interval = updated.interval;
  }
  return updated;
}
export function finishCoachSession(deck, kind, attempts, now = new Date()) {
  const entries = [...attempts.entries()];
  if (entries.length !== deck.cards.length || deck.cards.some(card=>!attempts.has(card.id))) return deck.coach || {};
  const today = dateKey(now), correct = entries.filter(([,value])=>value).length;
  if (kind === 'final') return {...deck.coach, lastTest:{day:today,correct,total:deck.cards.length},
    passedAt:correct === deck.cards.length ? now.toISOString() : null,
    passedSignature:correct === deck.cards.length ? deckSignature(deck) : null,
    lastRevisionDay:correct === deck.cards.length ? today : deck.coach?.lastRevisionDay || null};
  if (kind === 'revision') return {...deck.coach,lastRevisionDay:today};
  return deck.coach || {};
}
