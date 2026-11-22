import { dateKey, markingRules, scheduleReview, reviewPool, isDateKey, canUseStudyMethod } from './study-engine.js';

export const STAGES = ['new','needsPractice','learning','young','mature'];
export const STAGE_LABELS = {new:'New', needsPractice:'Needs lots of practice', learning:'Learning', young:'Young', mature:'Mature'};
export const MASTERY_POLICY=Object.freeze({version:4,recallSessions:3,readyScore:80,perfectTests:2,recallChecksBetweenTests:1});
const dayNumber = key => {const [year,month,day] = key.split('-').map(Number); return Date.UTC(year,month-1,day)/86400000;};
export function cardMastery(card, now = new Date()) {
  const history = (Array.isArray(card.reviewHistory) ? card.reviewHistory : []).filter(entry => entry && typeof entry.correct === 'boolean' && isDateKey(entry.day));
  const seen = Number(card.seen) || 0;
  if (!seen && !history.length) return {score:0, stage:'new', recallDays:0, recallSessions:0, practiceSessions:0, misses:0};
  const evidenceKey=entry=>typeof entry.attemptId==='string' && entry.attemptId.lastIndexOf(':')>0
    ? `session:${entry.attemptId.slice(0,entry.attemptId.lastIndexOf(':'))}` : `day:${entry.day}`;
  // Retries teach the same card: count a missed session once, not once per retry.
  const sessionResults=new Map();
  for (const [index,entry] of history.entries()) {
    const key=entry.attemptId ? evidenceKey(entry) : `legacy:${index}`, previous=sessionResults.get(key);
    sessionResults.delete(key);
    sessionResults.set(key,{...entry,correct:entry.correct && (previous?.correct ?? true)});
  }
  const recent=[...sessionResults.values()].slice(-8);
  const misses = recent.length ? recent.filter(entry => !entry.correct).length : Math.max(0, seen-(Number(card.right)||0));
  const recentAccuracy=recent.length ? recent.filter(entry=>entry.correct).length/recent.length : seen ? Math.max(0,Math.min(1,(Number(card.right)||0)/seen)) : 0;
  const unaided=entry=>entry.correct && !entry.assisted && ['type','final'].includes(entry.method);
  // Restore strict evidence rules per session, without excluding an entire day.
  const failedSessions=new Set(history.filter(entry=>!entry.correct).map(evidenceKey));
  const recall=history.filter(entry=>unaided(entry) && !failedSessions.has(evidenceKey(entry)));
  const recallDays=new Set(recall.map(entry=>entry.day)).size;
  const recallSessions=new Set(recall.map(evidenceKey)).size;
  const successful=history.filter(entry=>entry.correct && !failedSessions.has(evidenceKey(entry)));
  const practiceSessions=new Set(successful.map(evidenceKey)).size;
  const overdue = isDateKey(card.next) ? Math.max(0,dayNumber(dateKey(now))-dayNumber(card.next)) : 0;
  const decay=Math.min(20,overdue/Math.max(1,Number(card.stability ?? card.interval)||1)*5);
  let recallEvidence=0,recognitionEvidence=0,previousRecallDay=null;
  for (const entry of sessionResults.values()) {
    if (!entry.correct) {recallEvidence*=.7;recognitionEvidence*=.7;continue;}
    if (unaided(entry)) {
      const gap=previousRecallDay ? Math.max(0,dayNumber(entry.day)-dayNumber(previousRecallDay)) : 0;
      // Remembering after a gap supplies stronger evidence than immediate repetition.
      recallEvidence+=1+Math.min(1.5,Math.log2(1+gap)*.6);
      if (!previousRecallDay || entry.day>previousRecallDay) previousRecallDay=entry.day;
    } else {
      recognitionEvidence+=({flip:.2,quiz:.35,boolean:.15,match:.25}[entry.method] ?? .2)*(entry.assisted ? .5 : 1);
    }
  }
  // No accuracy baseline and no session quota. Confidence has diminishing returns;
  // unaided recall supplies most of the evidence. Recognition contributes little.
  const evidence=recallEvidence+Math.min(1,recognitionEvidence);
  const confidence=90*(1-Math.exp(-evidence/6));
  let score=Math.round(Math.max(0,confidence-decay));
  const struggling=(misses>=2 && recentAccuracy<.7) || (!recent.length && seen>=3 && recentAccuracy<.5);
  const lastMiss=history.findLastIndex(entry=>!entry.correct);
  const recovered=lastMiss<0 || new Set(history.slice(lastMiss+1).filter(unaided).map(evidenceKey)).size>=2;
  const verified=[...sessionResults.values()].filter(entry=>['type','final'].includes(entry.method) && !entry.assisted);
  const ready=confidence>=MASTERY_POLICY.readyScore && recallSessions>=MASTERY_POLICY.recallSessions && recovered && verified.slice(-2).length===2 && verified.slice(-2).every(entry=>entry.correct) && recent.slice(-2).every(entry=>entry.correct);
  const finals=new Set(history.slice(lastMiss+1).filter(entry=>entry.correct && entry.method==='final').map(evidenceKey)).size;
  if (ready && finals) score=Math.max(score,Math.round((finals>=MASTERY_POLICY.perfectTests?100:95)-decay));
  const stage = struggling ? 'needsPractice' : ready && score>=80 ? 'mature' : score >= 45 ? 'young' : 'learning';
  return {score,stage,recallDays,recallSessions,practiceSessions,misses,
    evidence,recallRemaining:Math.max(0,MASTERY_POLICY.recallSessions-recallSessions)};
}
export function masteryCounts(cards, now = new Date()) {
  const counts = Object.fromEntries(STAGES.map(stage=>[stage,0]));
  for (const card of cards) counts[cardMastery(card,now).stage]++;
  return counts;
}
export function needsAnotherLook(card) {
  const history = Array.isArray(card.reviewHistory) ? card.reviewHistory.filter(entry=>entry && typeof entry.correct==='boolean') : [];
  const last=history.at(-1);
  if (!last) return !!card.seen && card.right < card.seen;
  const session=id=>typeof id==='string' && id.lastIndexOf(':')>0 ? id.slice(0,id.lastIndexOf(':')) : null;
  const latest=session(last.attemptId);
  return latest ? history.some(entry=>session(entry.attemptId)===latest && !entry.correct) : !last.correct;
}
export function deckSignature(deck) {
  return JSON.stringify(deck.cards.map(card=>[card.id,card.q,card.a,markingRules(card.marking),card.acceptedAnswers||[]]));
}
export function coachStatus(deck, now = new Date()) {
  const today = dateKey(now), config = deck.coach || {};
  const counts = masteryCounts(deck.cards,now);
  const matching=config.testsSignature===deckSignature(deck) && [3,MASTERY_POLICY.version].includes(config.masteryVersion);
  const testPasses=matching ? Math.min(MASTERY_POLICY.perfectTests,config.testPasses||0) : 0;
  const recallChecksSinceTest=matching ? config.recallChecksSinceTest||0 : 0;
  const passed = !!config.passedAt && config.passedSignature === deckSignature(deck) && testPasses>=MASTERY_POLICY.perfectTests;
  const deadline = isDateKey(config.deadline) ? config.deadline : null;
  const maintenanceEnded = passed && deadline && today > deadline;
  return {counts,passed,deadline,maintenanceEnded,testPasses,recallChecksSinceTest,
    testAvailable:!testPasses || recallChecksSinceTest>=MASTERY_POLICY.recallChecksBetweenTests || (matching && isDateKey(config.lastTest?.day) && config.lastTest.day<today),
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
export const GUIDE_METHODS=['flip','quiz','type','match','boolean'];
export function guidedMethod(deck, now = new Date()) {
  const start=Number.isSafeInteger(deck.coach?.guideStep) && deck.coach.guideStep>=0 ? deck.coach.guideStep : 0;
  const target=overallPlan(deck,now)[0];
  const mastery=target ? cardMastery(target,now) : null;
  let preferred=null, reason='A change of activity helps you practise in different ways.';
  if (target && ['young','mature'].includes(mastery.stage) && deck.coach?.lastGuidedMethod!=='type' && start%3===0) {
    preferred='type';reason='These cards are getting stronger. Typing checks recall without showing you the answer.';
  } else if (target?.reviewHistory?.at(-1)?.correct===false) {
    preferred=deck.coach?.lastGuidedMethod==='flip'?'type':'flip';
    reason=preferred==='flip'?'A recent miss needs another look. Recall, reveal, then check the answer.':'Try recalling the answer without the card after your last flip session.';
  } else if (mastery && mastery.practiceSessions>=6 && mastery.recallSessions<MASTERY_POLICY.recallSessions && start%2===0) {
    preferred='type';reason='You have recognition practice; an unaided answer will give a clearer check of recall.';
  }
  if (preferred) {
    return {mode:preferred,step:start,reason};
  }
  for (let offset=0;offset<GUIDE_METHODS.length;offset++) {
    const step=start+offset,mode=GUIDE_METHODS[step%GUIDE_METHODS.length];
    if (canUseStudyMethod(mode,deck.cards)) return {mode,step,reason:mastery?.stage==='new' && mode==='flip'?'Start by getting familiar with the new cards.':reason};
  }
  return {mode:'flip',step:start};
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
    if (updated.reviewHistory[updated.reviewHistory.length-1].attemptId) updated.reviewHistory[updated.reviewHistory.length-1].nextReview=updated.next;
  }
  return updated;
}
export function finishCoachSession(deck, kind, attempts, now = new Date(),config={}) {
  const entries = [...attempts.entries()];
  const guideUpdate=Number.isSafeInteger(config.guideStep) && config.guideStep>=0 ? {guideStep:config.guideStep+1,lastGuidedMethod:config.mode} : {};
  const status=coachStatus(deck,now);
  const fullPerfect=deck.cards.length>0 && entries.length===deck.cards.length && deck.cards.every(card=>attempts.get(card.id)===true);
  const fullRecall=fullPerfect && config.mode==='type';
  if (['learn','practice'].includes(kind)) return entries.length ? {...deck.coach,...guideUpdate,...(fullRecall && status.testPasses>0 ? {recallChecksSinceTest:status.recallChecksSinceTest+1} : {})} : deck.coach || {};
  if (entries.length !== deck.cards.length || deck.cards.some(card=>!attempts.has(card.id))) return deck.coach || {};
  const today = dateKey(now), correct = entries.filter(([,value])=>value).length;
  if (kind === 'final') {
    if (!status.testAvailable || (fullPerfect && !status.ready)) return deck.coach || {};
    const testPasses=fullPerfect ? status.testPasses+1 : status.testPasses,passed=fullPerfect && testPasses>=MASTERY_POLICY.perfectTests;
    return {...deck.coach,masteryVersion:MASTERY_POLICY.version,testsSignature:deckSignature(deck),testPasses,recallChecksSinceTest:0,
      lastTest:{day:today,correct,total:deck.cards.length},
      passedAt:passed ? now.toISOString() : null,
      passedSignature:passed ? deckSignature(deck) : null,
      lastRevisionDay:passed ? today : deck.coach?.lastRevisionDay || null};
  }
  if (kind === 'revision') return {...deck.coach,...guideUpdate,lastRevisionDay:today};
  return deck.coach || {};
}
