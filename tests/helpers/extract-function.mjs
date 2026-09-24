// Pulls the exact source text of ONE named function out of a source file, so a test can run the REAL code
// (against real stores in a vm sandbox) instead of grepping it. The .jsx views have no JSX transform in
// `node --test`, but a handler like StrategyDetailsTab's setLinkedProfile() or the hub's onSave() contains
// no JSX at all - extracting it and executing it is the closest thing to "the actual UI callback" that runs
// without a DOM. Balanced-brace scanning that skips strings, template literals and comments, so a brace inside
// a string can never end the function early.

function skipString(text, index) {
  const quote = text[index];
  let i = index + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') { i += 2; continue; }
    if (quote === '`' && ch === '$' && text[i + 1] === '{') { i = scanBalanced(text, i + 1) + 1; continue; }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return text.length;
}

// `open` is the index of an opening bracket; returns the index of its matching closing bracket.
function scanBalanced(text, open) {
  const opener = text[open];
  const closer = { '{': '}', '(': ')', '[': ']' }[opener];
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (two === '//') { const end = text.indexOf('\n', i); i = end === -1 ? text.length : end; continue; }
    if (two === '/*') { const end = text.indexOf('*/', i + 2); i = end === -1 ? text.length : end + 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(text, i); continue; }
    if (ch === opener) depth += 1;
    else if (ch === closer) { depth -= 1; if (depth === 0) return i; }
    i += 1;
  }
  throw new Error('unbalanced ' + opener + ' starting at ' + open);
}

export function extractFunction(source, name) {
  const text = String(source).replace(/\r\n/g, '\n');
  const pattern = new RegExp('(?:^|\\n)[ \\t]*((?:export\\s+)?(?:async\\s+)?function\\s+' + name + '\\s*\\()');
  const match = pattern.exec(text);
  if (!match) throw new Error('could not find function ' + name);
  const start = match.index + match[0].indexOf(match[1]);
  // export/`async` stay out of the returned text only for `export`; `async` is part of the function.
  const paramsOpen = text.indexOf('(', start + match[1].length - 1);
  const paramsClose = scanBalanced(text, paramsOpen);
  const bodyOpen = text.indexOf('{', paramsClose);
  const bodyClose = scanBalanced(text, bodyOpen);
  return text.slice(start, bodyClose + 1).replace(/^export\s+/, '');
}
