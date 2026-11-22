import { markingRules } from './study-engine.js';

export function MarkingSettings({value, onChange, alternatives = [], onAlternativesChange}) {
  const rules = markingRules(value);
  return <fieldset className="marking-settings">
    <legend>Marking for this question</legend>
    <p>Choose how closely a response must match the saved answer. These rules also apply when questions and answers are reversed.</p>
    {[
      ['caseSensitive', 'Case sensitive', 'Require capital and lowercase letters to match.'],
      ['ignoreDiacritics', 'Allow diacritic differences', 'Treat accents such as é/e, ñ/n and ü/u as equivalent.'],
      ['ignorePunctuation', 'Allow punctuation differences', 'Ignore ordinary punctuation; keep decimal points and numerical signs.'],
      ['allowTypos', 'Allow small spelling mistakes', 'Accept a small typo in longer words, while checking numbers and negation.'],
      ['ignoreExtraSpaces', 'Ignore extra spaces', 'Treat repeated spaces and line breaks as a single space.'],
    ].map(([key,label,help]) => <label key={key}><input type="checkbox" checked={rules[key]} onChange={event => onChange({...rules, [key]:event.target.checked})} /><span><strong>{label}</strong><small>{help}</small></span></label>)}
    {onAlternativesChange && <label className="alternatives-label"><span><strong>Other accepted answers (optional)</strong><small>One answer per line. Used when answering the question, including the final test. Reverse study checks the question text instead.</small></span><textarea aria-label="Other accepted answers" value={alternatives.join('\n')} onChange={event => onAlternativesChange(event.target.value.split('\n'))} rows="3" /></label>}
  </fieldset>;
}
