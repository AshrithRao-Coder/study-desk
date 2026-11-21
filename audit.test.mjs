import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAnswer, scheduleReview, isDateKey } from './study-engine.js';
import { cardMastery } from './coach-engine.js';
import { parseCardLines, serializeCards } from './card-format.js';
import { saveSession, loadSession, clearSession } from './session-store.js';
import { feedbackMessage } from './feedback.js';
import { assessCardAnswer } from './study-engine.js';

const now=new Date(2026,10,21,12), base={id:'a',q:'Capital?',a:'Paris',tags:[],seen:0,right:0,next:'2026-11-21',interval:0,lapses:0,reps:0};
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
const draft=(config={})=>({id:'session',config:{mode:'type',scope:'all',flip:false,limit:2,...config},queue:['a','b'],pos:0,feedback:null,count:0,attempts:[],retries:[]});
test('close and completely wrong feedback remain incorrect under the marking rules',()=> {
  const near=assessCardAnswer('Pari',base),wrong=assessCardAnswer('Banana',base);
  assert.equal(near.correct,false);assert.equal(near.near,true);
  assert.equal(wrong.correct,false);assert.equal(wrong.near,false);
  assert.match(feedbackMessage({...near,retryScheduled:true}),/^Not quite this time\./);
  assert.match(feedbackMessage({...wrong,retryScheduled:true}),/^You got this one wrong\./);
  const first=feedbackMessage({...wrong,retryScheduled:true,sessionMisses:1});
  const second=feedbackMessage({...wrong,retryScheduled:true,sessionMisses:2});
  const last=feedbackMessage({...wrong,retryScheduled:false,sessionMisses:3});
  assert.doesNotMatch(first,/attempt|missed/i);
  assert.match(second,/1 attempt left/);
  assert.doesNotMatch(second,/missed this card/);
  assert.match(last,/missed this card on all 3 attempts/);
  assert.match(last,/This card will come back next session\./);
  assert.doesNotMatch(last,/bring this card back/);
  assert.doesNotMatch(last,/attempt left/);
  for (const result of [near,wrong,{correct:false,feedbackKind:'revealed'},{correct:false,feedbackKind:'self-check'}]) {
    const message=feedbackMessage({...result,retryScheduled:false});
    assert.match(message,/bring this card back/);
    assert.doesNotMatch(message,/more practice|more review|Take a little longer/i);
    assert.doesNotMatch(message,/tomorrow|today|next session|\d{4}-\d{2}-\d{2}/i);
    const finalMessage=feedbackMessage({...result,retryScheduled:false,sessionMisses:3});
    assert.match(finalMessage,/This card will come back next session\./);
    assert.doesNotMatch(finalMessage,/bring this card back/);
  }
});
test('mathematical signs and grouping survive flexible punctuation marking',()=> {
  for (const [a,b] of [['-.5','.5'],['.5','5'],['1,5','15'],['2*(3+4)','2*3+4'],['x-y','xy'],['a/b','ab']]) assert.equal(assessAnswer(a,b).correct,false,`${a} must differ from ${b}`);
  assert.equal(assessAnswer('−.5','-.5').correct,true);
  assert.equal(assessAnswer('well-being','wellbeing').correct,true);
  assert.equal(assessAnswer('Hello!','hello').correct,true);
  assert.equal(assessAnswer('Chapter (1)','Chapter 1').correct,true);
});
test('repeated practice cannot erase independent recall evidence or launder a failed day',()=> {
  const recall=Array.from({length:9},(_,index)=>({day:['2026-11-19','2026-11-20','2026-11-21'][index%3],method:'type',correct:true,assisted:false,attemptId:`learned-${index}:0`}));
  const repeated=Array.from({length:10},()=>({day:'2026-11-21',method:'quiz',correct:true,assisted:false}));
  const learned={...base,seen:13,right:13,stability:6,reviewHistory:[...recall,...repeated]};
  assert.equal(cardMastery(learned,now).stage,'mature');
  const failed={...learned,reviewHistory:[...recall,{day:'2026-11-21',method:'type',correct:false},...repeated]};
  assert.notEqual(cardMastery(failed,now).stage,'mature');
});
test('a repeated failed attempt has no additional same-day stability penalty',()=> {
  const known={...base,seen:20,right:20,stability:30,interval:30};
  const first=scheduleReview(known,{correct:false,method:'type'},now);
  const second=scheduleReview(first,{correct:false,method:'type'},now);
  assert.equal(first.stability,second.stability);
  assert.equal(second.lapses,1);
});
test('real calendar dates are required',()=> {
  assert.equal(isDateKey('2024-02-29'),true);
  for (const value of ['2026-02-29','2026-11-31','2026-13-01','2026-00-01','2026-11-00','bad']) assert.equal(isDateKey(value),false,value);
});
test('CSV quoting, embedded commas and explanations survive import and export',()=> {
  const row=parseCardLines('"What, exactly?","He said ""hello""."')[0];
  assert.equal(row.q,'What, exactly?');assert.equal(row.a,'He said "hello".');
  assert.equal(parseCardLines('Question | "Hello" is a greeting')[0].a,'"Hello" is a greeting');
  const card={...base,explanation:'A memory aid.\nIncluding a | pipe and "quotes".'};
  assert.equal(parseCardLines(serializeCards([card]))[0].explanation,card.explanation);
});
test('unfinished sessions round-trip and invalidate if the material changes',()=> {
  const storage=memory(),deck={id:'deck',cards:[base,{...base,id:'b'}]};
  saveSession(deck,draft(),storage);
  assert.equal(loadSession(deck,storage).pos,0);
  assert.equal(loadSession({...deck,cards:[{...base,a:'Changed'},{...base,id:'b'}]},storage),null);
  saveSession(deck,draft(),storage); clearSession(deck,storage);
  assert.equal(loadSession(deck,storage),null);
});
test('old paused gap sessions resume as typed recall without losing checked results',()=> {
  const storage=memory(),deck={id:'deck',cards:[base,{...base,id:'b'}]};
  saveSession(deck,{...draft({mode:'gap'}),feedback:{result:{correct:true,method:'gap'},next:'2026-11-22'},count:1,attempts:[['a',true]]},storage);
  const restored=loadSession(deck,storage);
  assert.equal(restored.config.mode,'type');
  assert.equal(restored.feedback.result.method,'type');
  assert.deepEqual(restored.attempts,[['a',true]]);
});
test('refresh between card save and session save restores feedback without double counting',()=> {
  const storage=memory(),deck={id:'deck',cards:[base,{...base,id:'b'}]};
  saveSession(deck,draft(),storage);
  const reviewed=scheduleReview(base,{correct:false,method:'type',attemptId:'session:0'},now);
  const updated={...deck,cards:[reviewed,deck.cards[1]]};
  const restored=loadSession(updated,storage);
  assert.equal(restored.count,1); assert.equal(restored.feedback.result.correct,false);
  assert.equal(restored.queue.filter(id=>id==='a').length,2);
  assert.equal(loadSession(updated,storage).count,1);
  assert.equal(scheduleReview(reviewed,{correct:false,method:'type',attemptId:'session:0'},now),reviewed);
});
test('a final test can resume after multiple recorded answers without creating retries',()=> {
  const storage=memory(),deck={id:'deck',cards:[base,{...base,id:'b'}]};
  saveSession(deck,draft({coachKind:'final'}),storage);
  const updated={...deck,cards:deck.cards.map((card,index)=>scheduleReview(card,{correct:index===1,method:'final',attemptId:`session:${index}`},now))};
  const restored=loadSession(updated,storage);
  assert.equal(restored.pos,2);assert.equal(restored.count,2);
  assert.equal(restored.queue.length,2);assert.deepEqual(restored.attempts,[['a',false],['b',true]]);
});
