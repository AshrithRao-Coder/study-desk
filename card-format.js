import { DEFAULT_MARKING, markingRules } from './study-engine.js';

function splitOutside(text, separator, trackJSON=true) {
  const parts=[]; let quoted=false, escaped=false, depth=0, start=0;
  for (let index=0;index<text.length;index++) {
    const char=text[index];
    if (escaped) {escaped=false;continue;}
    if (quoted && char === '\\') {escaped=true;continue;}
    if (char === '"') {quoted=!quoted;continue;}
    if (!quoted) {
      if (trackJSON && '[{'.includes(char)) depth++;
      if (trackJSON && ']}'.includes(char)) depth--;
      if (text.startsWith(separator,index) && depth===0) {parts.push(text.slice(start,index));start=index+separator.length;index+=separator.length-1;}
    }
  }
  if (quoted || depth!==0) throw new Error('Unclosed quote or JSON value.');
  parts.push(text.slice(start)); return parts;
}
const encode = value => /[|\n\r"\\]/.test(value) || value!==value.trim() ? JSON.stringify(value) : value;
const decode = value => {
  const text=value.trim();
  if (!text.startsWith('"') || !text.endsWith('"')) return text;
  try {return JSON.parse(text);} catch {return text.slice(1,-1).replace(/""/g,'"');}
};
export function serializeCards(cards) {
  return cards.map(card => {
    const values={...markingRules(card.marking), acceptedAnswers:card.acceptedAnswers||[], tags:card.tags||[],...(card.explanation?{explanation:card.explanation}:{})};
    return `${encode(card.q)} | ${encode(card.a)} |(${Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join(';')})`;
  }).join('\n');
}
export function parseCardLines(text, defaults={}) {
  const rows=[];
  for (const [index,line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      let parts=splitOutside(line,'|',false);
      if (parts.length===1) {
        for (const separator of ['\t','::',' - ',' – ',';',',']) {
          const fields=splitOutside(line,separator,false);
          if (fields.length>=2) {parts=[fields[0],fields.slice(1).join(separator)];break;}
        }
        if (parts.length===1) throw new Error('Use question | answer.');
      }
      if (parts.length<2 || parts.length>3) throw new Error('Use two text fields and optional |(settings). Quote text that contains a pipe.');
      const q=decode(parts[0]), a=decode(parts[1]);
      if (typeof q!=='string' || typeof a!=='string' || !q.trim() || !a.trim()) throw new Error('Question and answer must not be empty.');
      let metadata=Object.create(null);
      if (parts[2]?.trim()) {
        const raw=parts[2].trim();
        if (raw.startsWith('{')) metadata=JSON.parse(raw);
        else {
          if (!raw.startsWith('(') || !raw.endsWith(')')) throw new Error('Settings must be inside parentheses.');
          for (const entry of splitOutside(raw.slice(1,-1),';').filter(value=>value.trim())) {
            const at=entry.indexOf('=');
            if (at<0) throw new Error('Each setting needs key=value.');
            const key=entry.slice(0,at).trim(), value=entry.slice(at+1).trim();
            metadata[key]=JSON.parse(value);
          }
        }
        if (!metadata || Array.isArray(metadata) || typeof metadata!=='object') throw new Error('Settings must be an object.');
        for (const [key,value] of Object.entries(metadata)) {
          if (key in DEFAULT_MARKING) {if (typeof value!=='boolean') throw new Error(`${key} must be true or false.`);}
          else if (['acceptedAnswers','tags'].includes(key)) {if (!Array.isArray(value) || value.some(item=>typeof item!=='string')) throw new Error(`${key} must be a JSON list of text.`);}
          else if (key==='explanation') {if (typeof value!=='string') throw new Error('explanation must be text.');}
          else throw new Error(`Unknown setting: ${key}.`);
        }
      }
      rows.push({q,a,marking:markingRules({...defaults.marking,...metadata}), acceptedAnswers:metadata.acceptedAnswers||[], tags:metadata.tags||defaults.tags||[],...(metadata.explanation!==undefined?{explanation:metadata.explanation}:{})});
    } catch (error) {throw new Error(`Line ${index+1}: ${error.message}`);}
  }
  if (!rows.length) throw new Error('Add at least one question and answer.');
  return rows;
}
