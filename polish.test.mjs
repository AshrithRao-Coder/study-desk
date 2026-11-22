import test from 'node:test';
import assert from 'node:assert/strict';
import { cardMastery, guidedMethod, needsAnotherLook, scheduleForDeck } from './coach-engine.js';
import { assessAnswer, assessCardAnswer } from './study-engine.js';
import { parseCardLines, serializeCards } from './card-format.js';

const now=new Date(2026,10,21,12);
const entry=(session,correct,method='type',attempt=0)=>({day:'2026-11-21',correct,method,assisted:false,attemptId:`${session}:${attempt}`});
const card={id:'a',q:'A question',a:'résumé',seen:9,right:9,stability:1,next:'2026-11-21',reviewHistory:Array.from({length:16},(_,i)=>entry(`good${i}`,true))};
test('retry misses count once for mastery, and later fresh recall can recover',()=> {
  const missed={...card,seen:10,reviewHistory:[...card.reviewHistory,entry('miss',false)]};
  const retries={...missed,seen:12,reviewHistory:[...missed.reviewHistory,entry('miss',false,'type',1),entry('miss',false,'type',2)]};
  assert.equal(cardMastery(retries,now).score,cardMastery(missed,now).score);
  assert.equal(cardMastery(retries,now).misses,1);
  assert.notEqual(cardMastery(retries,now).stage,'mature');
  assert.equal(needsAnotherLook(retries),true);
  const corrected={...retries,reviewHistory:[...retries.reviewHistory,entry('miss',true,'type',3)]};
  assert.equal(needsAnotherLook(corrected),true,'seeing the same answer again is not a fresh check');
  const recovered={...corrected,reviewHistory:[...corrected.reviewHistory,entry('fresh',true)]};
  assert.equal(needsAnotherLook(recovered),false);
  assert.ok(cardMastery(recovered,now).score>cardMastery(retries,now).score);
});
test('guided recommendations respond to mistakes and stronger recall without freezing variety',()=> {
  const weak={...card,reviewHistory:[entry('first',false)]};
  assert.equal(guidedMethod({cards:[weak],coach:{guideStep:1}},now).mode,'flip');
  assert.equal(guidedMethod({cards:[weak],coach:{guideStep:2,lastGuidedMethod:'flip'}},now).mode,'type');
  assert.equal(guidedMethod({cards:[card],coach:{guideStep:0}},now).mode,'type');
  assert.match(guidedMethod({cards:[card],coach:{}},now).reason,/recall/);
  const cards=['alpha','bravo','charlie','delta'].map((a,i)=>({...card,id:String(i),a}));
  let coach={guideStep:0};const modes=[];
  for(let i=0;i<15;i++) {const recommendation=guidedMethod({cards,coach},now);modes.push(recommendation.mode);coach={guideStep:recommendation.step+1,lastGuidedMethod:recommendation.mode};}
  for(const method of ['flip','quiz','type','match','boolean']) assert.ok(modes.includes(method),`${method} remains available in guided practice`);
});
test('strict accents cannot move during typo tolerance; all marking settings round-trip',()=> {
  assert.equal(assessAnswer('résume','resumé',{allowTypos:true,ignoreDiacritics:false}).correct,false);
  assert.equal(assessAnswer('résume','resumé',{allowTypos:true,ignoreDiacritics:true}).correct,true);
  const marking={caseSensitive:true,ignoreDiacritics:false,ignorePunctuation:false,allowTypos:true,ignoreExtraSpaces:false};
  const imported=parseCardLines(serializeCards([{...card,marking,acceptedAnswers:['curriculum vitæ!'],tags:['French']}]))[0];
  assert.deepEqual(imported.marking,marking);
  assert.equal(assessCardAnswer('curriculum vitæ!',imported).correct,true);
  assert.equal(assessCardAnswer('Curriculum vitae',imported).correct,false);
});
test('deadline scheduling and persisted attempt recovery agree on the next date',()=> {
  const result=scheduleForDeck({cards:[card],coach:{enabled:true,deadline:'2026-11-21'}},card,{correct:false,method:'type',attemptId:'test:0'},now);
  assert.equal(result.next,'2026-11-21');
  assert.equal(result.reviewHistory.at(-1).nextReview,result.next);
});

test('two perfect final answers confirm 100% without permanently freezing mastery',()=> {
  const almost={...card,reviewHistory:[...card.reviewHistory,entry('extra',true)]};
  assert.ok(cardMastery(almost,now).score<100);
  const first={...almost,reviewHistory:[...almost.reviewHistory,entry('final-test',true,'final')]};
  assert.ok(cardMastery(first,now).score<100);
  const passed={...first,reviewHistory:[...first.reviewHistory,entry('final-two',true,'final')]};
  assert.equal(cardMastery(passed,now).score,100);
  assert.equal(cardMastery(passed,now).stage,'mature');
  assert.ok(cardMastery({...passed,reviewHistory:[...passed.reviewHistory,entry('later-miss',false)]},now).score<100);
  assert.ok(cardMastery({...passed,next:'2026-11-20'},now).score<100);
  const fresh={...card,seen:1,right:1,reviewHistory:[entry('early-final',true,'final')]};
  assert.notEqual(cardMastery(fresh,now).stage,'mature','A final answer cannot bypass the learning requirements');
});

test('remembering after gaps supplies stronger evidence than cramming without a session quota',()=> {
  const spaced=Array.from({length:8},(_,i)=>{
    const day=new Date(2026,9,31+i*3,12);
    return {...entry(`spaced-${i}`,true),day:`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`};
  });
  const crammed=spaced.map(item=>({...item,day:'2026-11-21'}));
  const spacedCard={...card,seen:8,right:8,reviewHistory:spaced};
  assert.ok(cardMastery(spacedCard,now).score>cardMastery({...spacedCard,reviewHistory:crammed},now).score);
  assert.equal(cardMastery(spacedCard,now).stage,'mature','Strong spaced recall can be ready before sixteen sessions');
  assert.notEqual(cardMastery({...spacedCard,reviewHistory:crammed},now).stage,'mature');
});
