import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { runInContext } from 'node:vm';
import { dateKey } from './study-engine.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const windows = [];
function createWindow(html) {
  const window = new Window({url: 'https://test.local/', settings: {disableJavaScriptFileLoading: true, disableCSSFileLoading: true}});
  window.document.write(html.replace(/<script[\s\S]*?<\/script>/g, ''));
  windows.push(window);
  return window;
}
function forecast(fahrenheit = false) {
  const convert = c => fahrenheit ? c * 1.8 + 32 : c;
  const days = ['2026-11-19','2026-11-20','2026-11-21'];
  const times = days.flatMap(d => Array.from({length: 24}, (_,i) => `${d}T${String(i).padStart(2,'0')}:00`));
  return {
    current: { time: '2026-11-20T10:15', temperature_2m: convert(12), apparent_temperature: convert(11), weather_code: 61, is_day: 1, wind_speed_10m: 10, wind_direction_10m: 90, relative_humidity_2m: 70, surface_pressure: 1010, cloud_cover: 50 },
    hourly: {time: times, temperature_2m: times.map(() => convert(12)), precipitation_probability: times.map(() => 70), wind_speed_10m: times.map(() => 10), weather_code: times.map(() => 61)},
    daily: {time: days, temperature_2m_min: days.map(() => convert(12)), temperature_2m_max: days.map(() => convert(18)), weather_code: days.map(() => 61), precipitation_probability_max: days.map(() => 70), wind_speed_10m_max: days.map(() => 10), uv_index_max: days.map(() => 1), precipitation_sum: days.map(() => 2), daylight_duration: days.map(() => 36000), sunrise: days.map(d => d+'T07:00'), sunset: days.map(d => d+'T17:00')}
  };
}
try {
  const niceHTML = process.env.STUDY_ONLY==='1' ? null : await read('../nice-out/nice-out/index.html').catch(error=>{if (error.code==='ENOENT') return null;throw error;});
  if (niceHTML) {
  const nice = createWindow(niceHTML);
  nice.localStorage.setItem('saved', '{broken');
  const run = js => runInContext(js, nice);
  run(await read('../nice-out/nice-out/jokes.js'));
  run(await read('../nice-out/nice-out/app.js'));
  run('place = {lat: 51, lon: 0, label: "London"}');
  nice.w = forecast();
  run('render(window.w, null)');
  const names = () => [...nice.document.querySelectorAll('.pack-row strong')].map(e => e.textContent);
  assert.deepEqual(names(), ['Umbrella', 'Sweater / jumper', 'Hooded waterproof']);
  assert.equal(nice.document.querySelectorAll('.packing input').length, 0, 'Recommendations have no checkboxes');
  assert.match(nice.document.querySelector('.packing').textContent, /70% rain chance/);
  assert.equal(nice.document.querySelectorAll('.day').length, 2);
  nice.w.daily.precipitation_probability_max = [70,0,10];
  run('render(window.w, null)');
  assert.deepEqual([...nice.document.querySelectorAll('.day-rain')].map(e=>e.textContent), ['0%','10%'], 'Every day shows rain odds, including zero');
  assert.match(nice.document.querySelector('svg').textContent, /14/, 'Chart uses selected place hour');
  nice.w = forecast(true);
  run('metric = false; render(window.w, null)');
  assert.deepEqual(names(), ['Umbrella', 'Sweater / jumper', 'Hooded waterproof'], 'Celsius and Fahrenheit suggest the same items');
  assert.deepEqual(Array.from(run('packingItems("rain", 80, -2, 1, 50, 5).filter(i=>i.needed).map(i=>i.id)')), ['coat','waterproof','gloves']);
  assert.deepEqual(Array.from(run('packingItems("clear", 0, 22, 7, 5, 30).filter(i=>i.needed).map(i=>i.id)')), ['sun','water']);
  assert.equal(run('packingHTML(packingItems("clear",0,20,1,0,22)).includes("Travel light")'), true);
  await run('search("200, 0")');
  assert.match(nice.document.querySelector('#hits').textContent, /Latitude must/);
  nice.fetch = async () => { throw new Error('offline'); };
  nice.localStorage.setItem('cache', JSON.stringify({w: forecast(true), air: null, p: {lat: 51, lon: 0}, metric: false, at: Date.now()}));
  await run('load({lat: 52, lon: 0, label:"Other"})');
  assert.match(nice.document.querySelector('#app').textContent, /Couldn't get the weather/, 'Never show another place’s cache');
  await run('load({lat: 51, lon: 0, label:"London"})');
  assert.match(nice.document.querySelector('#offline-note').textContent, /Offline/, 'Matching offline cache works');
  const deferred = [];
  nice.fetch = url => url.includes('air-quality') ? Promise.resolve({ok: false}) : new Promise(resolve => deferred.push(resolve));
  const first = run('load({lat: 1, lon: 0, label:"First"})');
  const second = run('load({lat: 2, lon: 0, label:"Second"})');
  deferred[1]({ok:true, json:async()=>forecast(true)}); await second;
  deferred[0]({ok:true, json:async()=>forecast(true)}); await first;
  assert.equal(JSON.parse(nice.localStorage.getItem('cache')).p.lat, 2, 'Older request cannot overwrite a newer forecast');
  console.log('NiceOut: suggestions, units, time, cache, invalid input and request races passed');
  } else console.log('NiceOut integration checks skipped: running StudyDesk as a standalone project.');

  const studyHTML = await read('index.html');
  const study = createWindow(studyHTML);
  const cards = ['Lima','Paris','Paris','Rome','Tokyo'].map((a,i) => ({id: String(i), q:'Capital '+i, a, tags:[], ease:2.5, interval:0, reps:0, lapses:0, next:'2020-01-01', starred:false, seen:0,right:0}));
  study.localStorage.setItem('study:decks', JSON.stringify([{id:'deck', name:'Geography', cards}]));
  study.eval(studyHTML.match(/<script>([\s\S]*?)<\/script>/)[1]);
  await tick();
  const buttons = () => [...study.document.querySelectorAll('button')];
  const click = async text => { const b = buttons().find(b => b.textContent.trim() === text || b.classList.contains('method-button') && b.querySelector('strong')?.textContent === text); assert.ok(b, `Button exists: ${text}`); b.click(); await tick(); };
  assert.match(study.document.body.textContent, /Download library backup/);
  buttons().find(b=>b.textContent.includes('Geography')).click(); await tick();
  assert.equal(study.document.querySelectorAll('.method-button').length, 5);
  assert.equal(buttons().some(button=>button.textContent.includes('Hinted recall')),false);
  assert.equal(buttons().some(b=>b.textContent.includes('Build the answer')), false);
  await click('Multiple choice');
  buttons().find(b=>b.textContent.startsWith('Start')).click(); await tick();
  let options = buttons().filter(b=>['Lima','Paris','Rome','Tokyo'].includes(b.textContent));
  assert.equal(options.length, 4);
  assert.equal(new Set(options.map(b=>b.textContent)).size, 4, 'Quiz choices are unique');
  const prompt = study.document.querySelector('.question-text').textContent;
  const correct = cards.find(c=>c.q === prompt).a;
  options.find(b=>b.textContent !== correct).click(); await tick();
  assert.equal(buttons().some(b=>['Again','Hard','Good','Easy'].includes(b.textContent)), false);
  const reviewed = JSON.parse(study.localStorage.getItem('study:decks'))[0].cards.find(c=>c.q === prompt);
  assert.equal(reviewed.right, 0, 'A wrong answer is recorded automatically before Continue');
  assert.equal(reviewed.interval, 1);
  assert.equal(reviewed.lapses, 1);
  await click('Continue');
  for (let i = 0; i < 5; i++) {
    const nextPrompt = study.document.querySelector('.question-text').textContent;
    const expected = cards.find(c=>c.q === nextPrompt).a;
    await click(expected);
    await click('Continue');
  }
  assert.match(study.document.body.textContent, /Session done/);
  assert.match(study.document.body.textContent, /80%/, 'First-time accuracy excludes successful retries');
  assert.equal(JSON.parse(study.localStorage.getItem('study:decks'))[0].cards.find(c=>c.q===prompt).interval, 1, 'Same-day retry stays due tomorrow');
  await click('Back to deck');
  await click('All decks');
  await click('Restore backup');
  const fileInput = study.document.querySelector('input[type=file]');
  Object.defineProperty(fileInput, 'files', {configurable:true, value:[new study.File(['{"format":"bad"}'], 'bad.json')]});
  fileInput.dispatchEvent(new study.Event('change',{bubbles:true})); await tick();
  assert.match(study.document.body.textContent, /Could not restore/);
  assert.equal(JSON.parse(study.localStorage.getItem('study:decks'))[0].cards.length, 5, 'Invalid restore preserves library');
  const backup = {format:'study-desk',version:1,decks:[{id:'restored',name:'Restored deck',cards:[{...cards[0],marking:{caseSensitive:true,ignorePunctuation:false,allowTypos:false,ignoreExtraSpaces:false},acceptedAnswers:['Alternative'],stability:5,difficulty:4}]}],stats:{goal:20,last:null,streak:0,todayCount:0}};
  study.confirm = () => true;
  Object.defineProperty(fileInput, 'files', {configurable:true, value:[new study.File([JSON.stringify(backup)], 'backup.json')]});
  fileInput.dispatchEvent(new study.Event('change',{bubbles:true})); await tick();
  assert.match(study.document.body.textContent, /Restored deck/);
  assert.equal(JSON.parse(study.localStorage.getItem('study:decks'))[0].id, 'restored');
  assert.equal(JSON.parse(study.localStorage.getItem('study:decks'))[0].cards[0].marking.caseSensitive, true, 'Backup restores per-question rules');
  assert.deepEqual(JSON.parse(study.localStorage.getItem('study:decks'))[0].cards[0].acceptedAnswers, ['Alternative']);

  async function bootStudy(seed,coach={},extraStorage={}) {
    const window = createWindow(studyHTML);
    window.localStorage.setItem('study:decks', JSON.stringify([{id:'modes',name:'Methods',cards:seed,coach}]));
    for (const [key,value] of Object.entries(extraStorage)) window.localStorage.setItem(key,value);
    window.eval(studyHTML.match(/<script>([\s\S]*?)<\/script>/)[1]); await tick();
    const allButtons = () => [...window.document.querySelectorAll('button')];
    const click = async text => {
      const button = allButtons().find(button=>button.textContent.trim()===text || button.classList.contains('method-button') && button.querySelector('strong')?.textContent===text);
      assert.ok(button, `Button exists: ${text}`); assert.equal(button.disabled,false, `${text} is enabled`); button.click(); await tick();
    };
    allButtons().find(button=>button.textContent.startsWith('Methods')).click(); await tick();
    const fill = async (element,value) => {
      assert.ok(element, 'Answer field exists');
      const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
      element.dispatchEvent(new window.Event('input',{bubbles:true})); await tick();
    };
    return {window,click,fill,allButtons,start:async method=>{await click(method); allButtons().find(button=>button.textContent.startsWith('Start —')).click(); await tick();}};
  }
  const seed = (id,answer,extra={}) => ({...cards[0],id:String(id),q:`Question ${id}`,a:answer,...extra});
  const flipping=await bootStudy([seed(0,'Paris')]);
  assert.equal(flipping.allButtons().some(button=>button.textContent.includes('Fill the gap')),false);
  await flipping.start('Flip the card');
  assert.equal(flipping.window.document.querySelector('#recall-answer'),null,'Flip cards require no typing');
  assert.equal(flipping.window.document.querySelector('.flip-card').getAttribute('aria-expanded'),'false');
  assert.equal(JSON.parse(flipping.window.localStorage.getItem('study:decks'))[0].cards[0].seen,0);
  flipping.window.document.querySelector('.flip-card').click();await tick();
  assert.match(flipping.window.document.querySelector('.flip-card').textContent,/Paris/);
  assert.equal(JSON.parse(flipping.window.localStorage.getItem('study:decks'))[0].cards[0].seen,0,'Revealing does not count as a successful recall');
  flipping.window.document.querySelector('.flip-card').click();await tick();
  assert.equal(flipping.window.document.querySelector('.flip-card').getAttribute('aria-expanded'),'false');
  flipping.window.document.querySelector('.flip-card').click();await tick();
  await flipping.click('I missed it');
  assert.match(flipping.window.document.querySelector('.answer-feedback').textContent,/You didn’t remember this one/);
  assert.doesNotMatch(flipping.window.document.querySelector('.answer-feedback').textContent,/Not quite/);
  assert.equal(JSON.parse(flipping.window.localStorage.getItem('study:decks'))[0].cards[0].right,0);
  await flipping.click('Continue');
  flipping.window.document.querySelector('.flip-card').click();await tick();await flipping.click('I remembered it');
  assert.match(flipping.window.document.querySelector('.answer-feedback').textContent,/You remembered it/);
  await flipping.click('Continue');
  assert.match(flipping.window.document.body.textContent,/Session done/);
  const flippedResult=JSON.parse(flipping.window.localStorage.getItem('study:decks'))[0].cards[0];
  assert.equal(flippedResult.seen,2);assert.equal(flippedResult.right,1);assert.equal(flippedResult.interval,1);
  const strict = {caseSensitive:true,ignoreDiacritics:false,ignorePunctuation:false,allowTypos:false,ignoreExtraSpaces:false};
  const reveal=await bootStudy([seed(0,'Paris')]);
  await reveal.start('Type the answer');
  reveal.allButtons().find(button=>button.textContent.startsWith('Show answer')).click();await tick();
  assert.match(reveal.window.document.querySelector('.answer-feedback').textContent,/Here’s the answer/);
  assert.doesNotMatch(reveal.window.document.querySelector('.answer-feedback').textContent,/Not quite/);
  await reveal.click('Pause');await reveal.click('Resume session');
  assert.match(reveal.window.document.querySelector('.answer-feedback').textContent,/Here’s the answer/,'Feedback remains appropriate after resuming');
  const type = await bootStudy([seed(0,'Photosynthesis!',{marking:strict}),seed(1,'Photosynthesis!')]);
  await type.start('Type the answer');
  assert.match(type.window.document.querySelector('.marking-summary').textContent, /Case sensitive/);
  await type.fill(type.window.document.querySelector('#recall-answer'),'photosynthesis');
  await type.click('Check answer');
  assert.match(type.window.document.querySelector('.answer-feedback').textContent, /Not quite/);
  await type.click('Continue');
  await type.fill(type.window.document.querySelector('#recall-answer'),'photosynthesis');
  await type.click('Check answer');
  assert.match(type.window.document.querySelector('.answer-feedback').textContent, /^Correct/);
  const typeSaved = JSON.parse(type.window.localStorage.getItem('study:decks'))[0].cards;
  assert.equal(typeSaved[0].right,0);
  assert.equal(typeSaved[1].right,1,'Each question uses its own marking settings');

  const truth = await bootStudy([seed(0,'London'),seed(1,'Paris')]);
  await truth.start('True or false');
  const currentQuestion = truth.window.document.querySelector('.question-text').textContent;
  const proposed = truth.window.document.querySelector('.proposed-answer strong').textContent;
  await truth.click(proposed === (currentQuestion === 'Question 0' ? 'London' : 'Paris') ? 'True' : 'False');
  assert.match(truth.window.document.querySelector('.answer-feedback').textContent,/^Correct/);

  const matching = await bootStudy([seed(0,'London'),seed(1,'Paris'),seed(2,'Rome')]);
  await matching.start('Matching pairs');
  for (const [id,answer] of [[0,'London'],[1,'Paris'],[2,'Rome']]) {
    await matching.click(`Question ${id}`); await matching.click(answer);
  }
  assert.match(matching.window.document.body.textContent,/All pairs matched/);
  assert.ok(JSON.parse(matching.window.localStorage.getItem('study:decks'))[0].cards.every(card=>card.seen===1 && card.right===1));
  await matching.click('Continue');
  assert.match(matching.window.document.body.textContent,/Session done/);

  const editor = await bootStudy([seed(0,'London')]);
  await editor.click('Cards (1)'); await editor.click('edit');
  const setting = text => [...editor.window.document.querySelectorAll('.marking-settings label')].find(label=>label.querySelector('strong')?.textContent===text).querySelector('input');
  setting('Case sensitive').click(); await tick();
  setting('Allow punctuation differences').click(); await tick();
  setting('Allow small spelling mistakes').click(); await tick();
  setting('Ignore extra spaces').click(); await tick();
  await editor.fill(editor.window.document.querySelector('[aria-label="Other accepted answers"]'),'City of London');
  await editor.click('Save card');
  const edited = JSON.parse(editor.window.localStorage.getItem('study:decks'))[0].cards[0];
  assert.deepEqual(edited.marking,strict,'Card editor saves every selected rule');
  assert.deepEqual(edited.acceptedAnswers,['City of London']);
  await editor.click('Add');
  const labelledField = text => [...editor.window.document.querySelectorAll('label')].find(label=>label.querySelector('span')?.textContent===text)?.querySelector('textarea');
  await editor.fill(labelledField('Question'),'A new question');
  await editor.fill(labelledField('Answer'),'Python');
  setting('Case sensitive').click(); await tick();
  await editor.click('Add card');
  const added = JSON.parse(editor.window.localStorage.getItem('study:decks'))[0].cards.find(card=>card.q==='A new question');
  assert.equal(added.marking.caseSensitive,true,'New question saves the chosen case rule');
  assert.equal(added.marking.ignorePunctuation,true,'Other new-question defaults remain independent');

  await type.click('End');
  await type.click('Import / export');
  type.window.confirm = () => true;
  await type.click('Reset review history');
  const reset = JSON.parse(type.window.localStorage.getItem('study:decks'))[0].cards;
  assert.ok(reset.every(card=>card.seen===0 && card.lastReviewDay===undefined && card.stability===undefined), 'Reset clears automatic scheduling history');
  assert.deepEqual(reset[0].marking,strict,'Reset retains per-question marking rules');

  const format = await bootStudy([seed(0,'café',{marking:{ignoreDiacritics:true},acceptedAnswers:['coffee'],tags:['French']})]);
  await format.click('Import / export');
  const exported = format.window.document.querySelector('textarea[readonly]').value;
  assert.match(exported,/\|\(caseSensitive=false;ignoreDiacritics=true/);
  await format.fill(format.window.document.querySelector('textarea[placeholder="question | answer"]'),exported);
  await format.click('Add to this deck');
  const imported = JSON.parse(format.window.localStorage.getItem('study:decks'))[0].cards.at(-1);
  assert.equal(imported.marking.ignoreDiacritics,true);
  assert.deepEqual(imported.acceptedAnswers,['coffee']);
  assert.deepEqual(imported.tags,['French']);

  const today = dateKey(new Date());
  const pastDay = days=>{const date=new Date(); date.setDate(date.getDate()+days); return dateKey(date);};
  const learned = (id,answer)=>seed(id,answer,{seen:3,right:3,next:today,interval:6,stability:6,reviewHistory:[-2,-1,0].map(days=>({day:pastDay(days),correct:true,assisted:false,method:'type'}))});
  const prepared=[learned(0,'Paris'),learned(1,'Tokyo')];
  const coached=await bootStudy(prepared,{enabled:true,deadline:pastDay(2)});
  assert.equal(coached.window.document.querySelectorAll('.method-button').length,0,'Coach recommends instead of asking for a method');
  await coached.click('Start final test');
  for (let i=0;i<prepared.length;i++) {
    const question=coached.window.document.querySelector('.question-text').textContent;
    await coached.fill(coached.window.document.querySelector('#recall-answer'),prepared.find(card=>card.q===question).a);
    await coached.click('Check answer');
    assert.equal(coached.window.document.querySelector('.answer-feedback'),null,'Final test does not reveal answers midway');
  }
  assert.match(coached.window.document.body.textContent,/Final test passed/);
  const passedDeck=JSON.parse(coached.window.localStorage.getItem('study:decks'))[0];
  assert.ok(passedDeck.coach.passedAt,'Full final test saves passed status');
  assert.equal(passedDeck.coach.lastTest.correct,2);
  await coached.click('Back to deck');
  assert.match(coached.window.document.body.textContent,/Revision is complete for today/);
  assert.equal(coached.allButtons().find(button=>button.textContent==='Start daily revision').disabled,true);
  await coached.click('Progress');
  assert.match(coached.window.document.body.textContent,/Nothing needs another look/);
  assert.doesNotMatch(coached.window.document.body.textContent,/Coming up this week/);
  assert.match(coached.window.document.body.textContent,/Needs lots of practice/);

  const daily=await bootStudy(passedDeck.cards,{...passedDeck.coach,lastRevisionDay:pastDay(-1)});
  await daily.click('Start daily revision');
  for (let i=0;i<prepared.length;i++) {
    const question=daily.window.document.querySelector('.question-text').textContent;
    await daily.fill(daily.window.document.querySelector('#recall-answer'),prepared.find(card=>card.q===question).a);
    await daily.click('Check answer'); await daily.click('Continue');
  }
  await daily.click('Back to deck');
  assert.equal(JSON.parse(daily.window.localStorage.getItem('study:decks'))[0].coach.lastRevisionDay,today);
  assert.equal(daily.allButtons().find(button=>button.textContent==='Start daily revision').disabled,true);

  const failed=await bootStudy(prepared,{enabled:true});
  await failed.click('Start final test');
  await failed.fill(failed.window.document.querySelector('#recall-answer'),'Wrong answer'); await failed.click('Check answer');
  const lastQuestion=failed.window.document.querySelector('.question-text').textContent;
  await failed.fill(failed.window.document.querySelector('#recall-answer'),prepared.find(card=>card.q===lastQuestion).a); await failed.click('Check answer');
  assert.match(failed.window.document.body.textContent,/Final test complete/);
  assert.doesNotMatch(failed.window.document.body.textContent,/Final test passed/);
  assert.equal(JSON.parse(failed.window.localStorage.getItem('study:decks'))[0].coach.passedAt,null);
  assert.equal(JSON.parse(failed.window.localStorage.getItem('study:decks'))[0].coach.lastTest.total,2,'Failed final has no retries');
  await failed.click('Back to deck');
  assert.ok(failed.allButtons().some(button=>button.textContent==='Start recommended session'),'Failed final returns to learning');

  const interrupted=await bootStudy(prepared,{enabled:true});
  await interrupted.click('Start final test');
  await interrupted.fill(interrupted.window.document.querySelector('#recall-answer'),'Paris'); await interrupted.click('Check answer');
  await interrupted.click('End');
  assert.equal(JSON.parse(interrupted.window.localStorage.getItem('study:decks'))[0].coach.passedAt,undefined,'Interrupted final cannot pass');

  const adaptive=await bootStudy([seed(0,'Paris')],{enabled:true});
  await adaptive.click('Start recommended session');
  assert.equal(adaptive.window.document.querySelector('.exercise-label').textContent,'Flip the card');
  adaptive.window.document.querySelector('.flip-card').click(); await tick(); await adaptive.click('I remembered it');
  assert.equal(adaptive.window.document.querySelector('.exercise-label').textContent,'Flip the card','Feedback keeps the method that was actually used');
  await adaptive.click('Continue'); await adaptive.click('Back to deck');
  await adaptive.click('Start recommended session');
  assert.equal(adaptive.window.document.querySelector('.exercise-label').textContent,'Type the answer','Coach moves from scaffolding to unaided recall');

  const deadline=await bootStudy([seed(0,'Paris')]);
  deadline.window.document.querySelector('.coach-toggle input').click(); await tick();
  await deadline.fill(deadline.window.document.querySelector('[aria-label="Learning deadline"]'),pastDay(3));
  assert.equal(JSON.parse(deadline.window.localStorage.getItem('study:decks'))[0].coach.deadline,pastDay(3));
  deadline.window.document.querySelector('.coach-toggle input').click(); await tick();
  assert.equal(deadline.window.document.querySelectorAll('.method-button').length,5,'Manual mode remains available per deck');

  await coached.click('Cards (2)'); await coached.click('edit');
  const accentSetting=[...coached.window.document.querySelectorAll('.marking-settings label')].find(label=>label.querySelector('strong')?.textContent==='Allow diacritic differences').querySelector('input');
  accentSetting.click(); await tick(); await coached.click('Save card');
  const changedCard=JSON.parse(coached.window.localStorage.getItem('study:decks'))[0].cards[0];
  assert.equal(changedCard.seen,0,'Changed marking resets learned evidence');
  await coached.click('Review');
  assert.doesNotMatch(coached.window.document.body.textContent,/Final test passed: 100%/,'Changed deck cannot retain its old pass');

  const struggling=await bootStudy([seed(0,'Paris',{seen:3,right:0,reviewHistory:[1,2,3].map(()=>({day:today,correct:false,assisted:false,method:'type'}))}),seed(1,'Tokyo')]);
  await struggling.click('Needs lots of practice');
  assert.ok(struggling.allButtons().some(button=>button.textContent==='Start — 1 cards'));

  const resumed=await bootStudy([seed(0,'Paris'),seed(1,'Tokyo')]);
  await resumed.start('Type the answer');
  await resumed.fill(resumed.window.document.querySelector('#recall-answer'),'Paris');await resumed.click('Check answer');
  await resumed.click('Pause');await resumed.click('Resume session');
  assert.match(resumed.window.document.querySelector('.answer-feedback').textContent,/^Correct/);
  assert.equal(JSON.parse(resumed.window.localStorage.getItem('study:decks'))[0].cards[0].seen,1,'Resuming feedback does not re-mark the card');
  await resumed.click('Continue');await resumed.click('Pause');
  const copiedStorage=Object.fromEntries(Array.from({length:resumed.window.localStorage.length},(_,index)=>{const key=resumed.window.localStorage.key(index);return [key,resumed.window.localStorage.getItem(key)];}));
  const refreshed=await bootStudy([],{},copiedStorage);
  await refreshed.click('Resume session');
  assert.equal(refreshed.window.document.querySelector('.question-text').textContent,'Question 1');
  await refreshed.fill(refreshed.window.document.querySelector('#recall-answer'),'Tokyo');await refreshed.click('Check answer');await refreshed.click('Continue');
  assert.match(refreshed.window.document.body.textContent,/Session done/);
  assert.equal(refreshed.window.localStorage.getItem('study:session:modes'),null,'Completed sessions are cleared');
  assert.equal(JSON.parse(refreshed.window.localStorage.getItem('study:stats')).todayCount,2,'Reloaded sessions do not double count statistics');

  const resumedFinal=await bootStudy(prepared,{enabled:true});
  await resumedFinal.click('Start final test');await resumedFinal.click('Skip question');await resumedFinal.click('Pause');
  const finalStorage=Object.fromEntries(Array.from({length:resumedFinal.window.localStorage.length},(_,index)=>{const key=resumedFinal.window.localStorage.key(index);return [key,resumedFinal.window.localStorage.getItem(key)];}));
  const reopenedFinal=await bootStudy([],{},finalStorage);
  await reopenedFinal.click('Resume session');
  const finalQuestion=reopenedFinal.window.document.querySelector('.question-text').textContent;
  await reopenedFinal.fill(reopenedFinal.window.document.querySelector('#recall-answer'),prepared.find(card=>card.q===finalQuestion).a);await reopenedFinal.click('Check answer');
  assert.match(reopenedFinal.window.document.body.textContent,/Final test complete/);
  assert.equal(JSON.parse(reopenedFinal.window.localStorage.getItem('study:decks'))[0].coach.lastTest.correct,1,'An earlier skipped question stays wrong after final-test resume');

  const explained=await bootStudy([seed(0,'Paris',{explanation:'Paris is the capital and largest city of France.'})]);
  await explained.start('Type the answer');
  assert.equal(explained.window.document.querySelector('.answer-explanation'),null,'Explanations stay hidden until answering');
  await explained.fill(explained.window.document.querySelector('#recall-answer'),'wrong');await explained.click('Check answer');
  assert.match(explained.window.document.querySelector('.answer-explanation').textContent,/largest city of France/);
  assert.match(explained.window.document.querySelector('.answer-feedback').textContent,/Your answer: wrong/);

  const undo=await bootStudy([seed(0,'Paris',{seen:4,right:3})]);
  await undo.click('Cards (1)');undo.window.document.querySelector('[aria-label="Delete Question 0"]').click();await tick();
  assert.equal(JSON.parse(undo.window.localStorage.getItem('study:decks'))[0].cards.length,0);
  await undo.click('Undo card deletion');
  assert.equal(JSON.parse(undo.window.localStorage.getItem('study:decks'))[0].cards[0].seen,4,'Undo keeps card history');
  undo.window.confirm=()=>true;await undo.click('Delete');await undo.click('Undo deck deletion');
  assert.equal(JSON.parse(undo.window.localStorage.getItem('study:decks'))[0].cards[0].right,3,'Undo keeps deck contents');
  await undo.fill(undo.window.document.querySelector('[aria-label="Search decks"]'),'missing');
  assert.match(undo.window.document.body.textContent,/No decks match/);
  await undo.fill(undo.window.document.querySelector('[aria-label="Search decks"]'),'Methods');
  assert.match(undo.window.document.body.textContent,/1 of 1 decks shown/);

  const board=await bootStudy([seed(0,'Paris',{acceptedAnswers:['City of Paris']}),seed(1,'City of Paris',{acceptedAnswers:['Paris']}),seed(2,'Rome')]);
  await board.start('Matching pairs');await board.click('Question 0');await board.click('City of Paris');
  assert.match(board.window.document.body.textContent,/Those don’t match/,'Different canonical answers cannot consume each other’s matching slots');
  await board.click('Paris');await board.click('Question 1');await board.click('City of Paris');await board.click('Question 2');await board.click('Rome');
  assert.match(board.window.document.body.textContent,/All pairs matched/);

  const textFile=await bootStudy([seed(0,'Paris')]);await textFile.click('Import / export');
  const fileField=textFile.window.document.querySelector('[aria-label="Choose cards text file"]');
  Object.defineProperty(fileField,'files',{configurable:true,value:[new textFile.window.File(['"Capital, in Japan?","Tokyo"'],'cards.csv')]});
  fileField.dispatchEvent(new textFile.window.Event('change',{bubbles:true}));await tick();
  assert.match(textFile.window.document.body.textContent,/1 cards ready to import/);
  await textFile.click('Add to this deck');
  assert.equal(JSON.parse(textFile.window.localStorage.getItem('study:decks'))[0].cards.at(-1).q,'Capital, in Japan?');
  const lastTry=await bootStudy([seed(0,'Paris')]);await lastTry.start('Type the answer');
  for (let attempt=0;attempt<3;attempt++) {
    await lastTry.fill(lastTry.window.document.querySelector('#recall-answer'),attempt===0?'Pari':'Banana');
    await lastTry.click('Check answer');
    const message=lastTry.window.document.querySelector('.answer-feedback').textContent;
    assert.match(message,attempt===0?/^Not quite this time\./:/^You got this one wrong\./);
    assert.match(message,attempt===2?/This card will come back next session\./:/bring this card back/);
    assert.doesNotMatch(message,/Next daily review|\d{4}-\d{2}-\d{2}/);
    if (attempt===2) {
      assert.match(message,/missed this card on all 3 attempts/);
      assert.doesNotMatch(message,/bring this card back/);
      await lastTry.click('Pause');await lastTry.click('Resume session');
      assert.match(lastTry.window.document.querySelector('.answer-feedback').textContent,/missed this card on all 3 attempts/);
    } else if (attempt===1) {assert.match(message,/1 attempt left/);assert.doesNotMatch(message,/missed this card/);}
    else assert.doesNotMatch(message,/attempt|missed this card/);
    await lastTry.click('Continue');
  }
  assert.match(lastTry.window.document.body.textContent,/Session done/);
  const sameDay=await bootStudy([seed(0,'Paris'),seed(1,'Tokyo')],{enabled:true});
  for (let session=0;session<2;session++) {
    await sameDay.click('Start recommended session');
    for (let question=0;question<2;question++) {
      if (session===0) {sameDay.window.document.querySelector('.flip-card').click();await tick();await sameDay.click('I remembered it');}
      else {
        const prompt=sameDay.window.document.querySelector('.question-text').textContent;
        await sameDay.fill(sameDay.window.document.querySelector('#recall-answer'),prompt==='Question 0'?'Paris':'Tokyo');
        await sameDay.click('Check answer');
      }
      await sameDay.click('Continue');
    }
    await sameDay.click('Back to deck');
  }
  await sameDay.click('Start final test');
  for (let question=0;question<2;question++) {
    const prompt=sameDay.window.document.querySelector('.question-text').textContent;
    await sameDay.fill(sameDay.window.document.querySelector('#recall-answer'),prompt==='Question 0'?'Paris':'Tokyo');
    await sameDay.click('Check answer');
  }
  await sameDay.click('Back to deck');
  assert.equal(sameDay.window.document.querySelector('.coach-metrics strong').textContent,'100%','A perfect two-card deck reaches full mastery on the same day');
  console.log('StudyDesk: five methods, diacritics, export/import, mastery, coach, final tests, daily revision, deadlines and backups passed');
} finally {
  for (const window of windows) await window.happyDOM.close();
}
