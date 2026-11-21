import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAnswer, markingRules } from './study-engine.js';
import { cardMastery, masteryCounts, needsAnotherLook, coachStatus, deckSignature, recommendedMethod, overallPlan, scheduleForDeck, finishCoachSession, guidedMethod } from './coach-engine.js';
import { serializeCards, parseCardLines } from './card-format.js';

const now=new Date(2026,10,21,12);
const basic={id:'a',q:'Capital?',a:'Paris',tags:[],seen:0,right:0,next:'2026-11-21',interval:0,lapses:0,reps:0};
const learned={...basic,seen:9,right:9,interval:6,stability:6,reviewHistory:Array.from({length:9},(_,index)=>({day:['2026-11-19','2026-11-20','2026-11-21'][index%3],correct:true,assisted:false,method:'type',attemptId:`learned-${index}:0`}))};
test('diacritics are independent of case, punctuation and typo tolerance',()=> {
  for (const [a,b] of [['cafe','café'],['nino','niño'],['uber','über'],['francais','français']]) {
    assert.equal(assessAnswer(a,b).correct,false);
    assert.equal(assessAnswer(a,b,{ignoreDiacritics:true,allowTypos:false}).correct,true);
  }
  assert.equal(assessAnswer('Cafe','café',{ignoreDiacritics:true,caseSensitive:true}).correct,false);
  assert.equal(assessAnswer('cafe','café!',{ignoreDiacritics:true,ignorePunctuation:false}).correct,false);
  assert.equal(assessAnswer('é','e\u0301',{allowTypos:false}).correct,true);
  assert.equal(assessAnswer('?','?').correct,true);
  assert.equal(assessAnswer('!','?').correct,false);
});
test('progress uses measured recall rather than interval buckets or perfect recognition',()=> {
  assert.equal(cardMastery(basic,now).stage,'new');
  const recognition={...learned,reviewHistory:learned.reviewHistory.map(item=>({...item,method:'quiz'}))};
  assert.notEqual(cardMastery(recognition,now).stage,'mature');
  assert.equal(cardMastery(learned,now).stage,'mature');
  const struggling={...basic,seen:3,right:0,reviewHistory:[1,2,3].map(()=>({day:'2026-11-21',correct:false,method:'type'}))};
  assert.equal(cardMastery(struggling,now).stage,'needsPractice');
  assert.equal(recommendedMethod(struggling,[struggling],now),'flip');
  assert.equal(recommendedMethod(learned,[learned],now),'type');
  assert.equal(needsAnotherLook(learned),false);
  assert.equal(needsAnotherLook(struggling),true);
  assert.deepEqual(masteryCounts([basic,learned,struggling],now),{new:1,needsPractice:1,learning:0,young:0,mature:1});
  assert.equal(overallPlan({cards:[learned,basic,struggling]},now)[0],struggling);
});
test('coach unlocks the final test only when every card has mastery evidence',()=> {
  const deck={cards:[learned,{...learned,id:'b'}],coach:{enabled:true}};
  assert.equal(coachStatus(deck,now).ready,true);
  assert.equal(coachStatus({...deck,cards:[learned,basic]},now).ready,false);
  assert.equal(coachStatus({cards:[],coach:{}},now).ready,false);
});
test('mastery needs three times the independent practice with strict mistake weights',()=> {
  const first={...basic,seen:1,right:1,stability:1,reviewHistory:[{day:'2026-11-21',correct:true,assisted:false,method:'type',attemptId:'first:0'}]};
  assert.equal(cardMastery(first,now).score,42);
  const third={...first,seen:3,right:3,reviewHistory:[1,2,3].map(index=>({...first.reviewHistory[0],attemptId:`session-${index}:0`}))};
  assert.equal(cardMastery(third,now).score,56);
  const missed={...third,seen:4,right:3,reviewHistory:[...third.reviewHistory,{day:'2026-11-21',correct:false,assisted:false,method:'type',attemptId:'missed:0'}]};
  assert.equal(cardMastery(missed,now).score,39);
  assert.equal(cardMastery(missed,now).recallSessions,3,'One missed session does not cancel earlier successful sessions that day');
  assert.notEqual(cardMastery(missed,now).stage,'mature');
});
test('a two-card deck can reach full mastery through separate perfect sessions on the same day',()=> {
  const history=Array.from({length:12},(_,index)=>({day:'2026-11-21',correct:true,assisted:false,method:'type',attemptId:`practice-${index}:0`}));
  const card={...basic,seen:3,right:3,stability:1,reviewHistory:history};
  const deck={cards:[card,{...card,id:'b'}],coach:{enabled:true}};
  assert.equal(cardMastery(card,now).recallDays,1);
  assert.equal(cardMastery(card,now).recallSessions,12);
  assert.equal(cardMastery(card,now).score,100);
  assert.equal(coachStatus(deck,now).score,100);
  assert.equal(coachStatus(deck,now).ready,true);
  assert.equal(coachStatus(deck,now).passed,false,'Mastery alone does not replace the final test');
  const singleSession={...card,reviewHistory:history.map((entry,index)=>({...entry,attemptId:`same-session:${index}`}))};
  assert.equal(cardMastery(singleSession,now).recallSessions,1);
  assert.notEqual(cardMastery(singleSession,now).stage,'mature','Retries inside one session are not independent sessions');
});
test('mastery needs nine independent successful sessions and does not rely on recognition alone',()=> {
  const history=Array.from({length:9},(_,index)=>({day:'2026-11-21',correct:true,assisted:false,method:'type',attemptId:`practice-${index}:0`}));
  const card={...basic,seen:9,right:9,stability:1,reviewHistory:history};
  assert.notEqual(cardMastery({...card,reviewHistory:history.slice(0,8)},now).stage,'mature');
  assert.equal(cardMastery(card,now).stage,'mature');
  assert.notEqual(cardMastery({...card,reviewHistory:history.map(entry=>({...entry,method:'quiz'}))},now).stage,'mature');
  assert.equal(cardMastery({...card,reviewHistory:history.map((entry,index)=>({...entry,method:index<3?'type':'quiz'}))},now).stage,'mature','Mixed methods count when enough unaided recalls support them');
});
test('guide rotation includes all five methods and skips unsupported choices',()=> {
  const cards=['Paris','Tokyo','Rome','Madrid'].map((a,index)=>({...basic,id:String(index),a}));
  const modes=Array.from({length:5},(_,guideStep)=>guidedMethod({cards,coach:{guideStep}}).mode);
  assert.deepEqual(modes,['flip','quiz','type','match','boolean']);
  assert.equal(guidedMethod({cards:cards.slice(0,2),coach:{guideStep:1}}).mode,'type');
  assert.equal(guidedMethod({cards:cards.slice(0,1),coach:{guideStep:3}}).mode,'flip');
  const deck={cards,coach:{enabled:true}};
  const next=finishCoachSession(deck,'learn',new Map([['0',true]]),now,{mode:'quiz',guideStep:1});
  assert.equal(next.guideStep,2);
  assert.equal(next.lastGuidedMethod,'quiz');
});
test('all questions and full marks are required to pass; edits invalidate the pass',()=> {
  const deck={cards:[learned,{...learned,id:'b'}],coach:{enabled:true}};
  assert.equal(finishCoachSession(deck,'final',new Map([['a',true]]),now).passedAt,undefined);
  const fail=finishCoachSession(deck,'final',new Map([['a',true],['b',false]]),now);
  assert.equal(fail.passedAt,null); assert.equal(fail.lastTest.correct,1);
  const pass=finishCoachSession(deck,'final',new Map([['a',true],['b',true]]),now);
  assert.equal(pass.passedSignature,deckSignature(deck));
  assert.equal(coachStatus({...deck,coach:pass},now).passed,true);
  assert.equal(coachStatus({...deck,coach:pass,cards:[{...learned,a:'Changed'},{...learned,id:'b'}]},now).passed,false);
});
test('passed decks request one complete daily revision and stop after the optional deadline',()=> {
  const deck={cards:[learned],coach:{enabled:true,deadline:'2026-11-22'}};
  const coach=finishCoachSession(deck,'final',new Map([['a',true]]),now);
  const passed={...deck,coach};
  assert.equal(coachStatus(passed,now).revisionDue,false);
  assert.equal(coachStatus(passed,new Date(2026,10,22,12)).revisionDue,true);
  const revision=finishCoachSession(passed,'revision',new Map([['a',false]]),new Date(2026,10,22,12));
  assert.equal(coachStatus({...passed,coach:revision},new Date(2026,10,22,12)).revisionDue,false);
  assert.equal(coachStatus(passed,new Date(2026,10,23,12)).maintenanceEnded,true);
  const noDeadline={...passed,coach:{...coach,deadline:null}};
  assert.equal(coachStatus(noDeadline,new Date(2026,11,30,12)).revisionDue,true);
});
test('optional guided practice preserves the final test and daily revision record',()=> {
  const deck={cards:[learned],coach:{enabled:true,deadline:'2026-11-21'}};
  const passed={...deck,coach:finishCoachSession(deck,'final',new Map([['a',true]]),now)};
  assert.deepEqual(finishCoachSession(passed,'practice',new Map([['a',false]]),now),passed.coach);
});
test('the deadline constrains coached review dates without affecting manual schedules',()=> {
  const card={...learned,next:'2026-11-21'};
  const deck={cards:[card],coach:{enabled:true,deadline:'2026-11-23'}};
  assert.equal(scheduleForDeck(deck,card,{correct:true,method:'type'},now).next,'2026-11-23');
  assert.ok(scheduleForDeck({...deck,coach:{...deck.coach,enabled:false}},card,{correct:true,method:'type'},now).next>'2026-11-23');
});
test('extended pipe format round-trips every marking rule, alternatives, tags and special text',()=> {
  const card={...basic,q:'What does [ | mean?\nA "quote"',a:'café | déjà vu',marking:{caseSensitive:true,ignoreDiacritics:true,ignorePunctuation:false,allowTypos:false,ignoreExtraSpaces:false},acceptedAnswers:['coffee; café','a | b'],tags:['French','a;b']};
  assert.deepEqual(parseCardLines(serializeCards([card])),[{q:card.q,a:card.a,marking:markingRules(card.marking),acceptedAnswers:card.acceptedAnswers,tags:card.tags}]);
  assert.equal(parseCardLines('What does [ mean? | bracket')[0].a,'bracket');
  assert.equal(parseCardLines('Question | Answer |(ignoreDiacritics=true;caseSensitive=true)')[0].marking.ignoreDiacritics,true);
  assert.equal(parseCardLines('Question - Answer')[0].a,'Answer');
  assert.throws(()=>parseCardLines('Question | Answer |(caseSensitive="yes")'),/Line 1/);
  assert.throws(()=>parseCardLines('Valid | answer\nBroken row'),/Line 2/);
});
