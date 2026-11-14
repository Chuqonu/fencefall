// Fencefall packaging (worker 23). Zero-dependency browser bundle.
// Entry: src/boot.js, src/styles.css, index.html → dist/index.html and dist/static/.
// No esbuild. Named imports are bound when a dependency factory returns.
// Function-declaration exports are published before imports so cyclic calls work.
// import.meta.url becomes the document base URL. Top-level await is rejected.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_EXT = new Set(['.js', '.mjs']);
const JSON_EXT = new Set(['.json']);
const CSS_EXT = new Set(['.css']);
const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.wav', '.mp3', '.ogg', '.ico']);
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.ico': 'image/x-icon', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json'
};

function fail(message) {
  const error = new Error(message);
  error.fencefallBuild = true;
  throw error;
}

function locOf(src, index) {
  let line = 1, col = 1;
  const n = Math.min(index, src.length);
  for (let i = 0; i < n; i++) {
    if (src[i] === '\n') { line++; col = 1; }
    else col++;
  }
  return {line, col};
}

class Scan {
  constructor(src, file) {
    this.src = src;
    this.file = file;
    this.i = 0;
    this.n = src.length;
  }
  eof() { return this.i >= this.n; }
  peek(k = 0) { return this.i + k < this.n ? this.src[this.i + k] : ''; }
  startsWith(s) { return this.src.startsWith(s, this.i); }
  loc() { return locOf(this.src, this.i); }
  fail(message) {
    const loc = this.loc();
    const snippet = this.src.slice(this.i, this.i + 80).replace(/\s+/g, ' ');
    fail(`${this.file}:${loc.line}:${loc.col} ${message} near ${JSON.stringify(snippet)}`);
  }
}

function isIdentStart(c) { return /[A-Za-z_$]/.test(c || ''); }
function isIdentCont(c) { return /[A-Za-z0-9_$]/.test(c || ''); }

function skipWs(scan) {
  let nl = false;
  while (!scan.eof()) {
    const c = scan.peek();
    if (c === ' ' || c === '\t' || c === '\f' || c === '\v') { scan.i++; continue; }
    if (c === '\n') { scan.i++; nl = true; continue; }
    if (c === '\r') { scan.i++; nl = true; if (scan.peek() === '\n') scan.i++; continue; }
    if (c === '/' && scan.peek(1) === '/') {
      scan.i += 2;
      while (!scan.eof() && scan.peek() !== '\n' && scan.peek() !== '\r') scan.i++;
      continue;
    }
    if (c === '/' && scan.peek(1) === '*') {
      const start = scan.i;
      scan.i += 2;
      while (!scan.eof() && !(scan.peek() === '*' && scan.peek(1) === '/')) {
        if (scan.peek() === '\n') nl = true;
        scan.i++;
      }
      if (scan.eof()) { scan.i = start; scan.fail('unterminated block comment'); }
      scan.i += 2;
      continue;
    }
    break;
  }
  return nl;
}

function matchKeyword(scan, word) {
  if (!scan.startsWith(word)) return false;
  const after = scan.peek(word.length);
  return !after || !isIdentCont(after);
}

function readIdent(scan) {
  if (!isIdentStart(scan.peek())) scan.fail('expected an identifier');
  const start = scan.i;
  scan.i++;
  while (isIdentCont(scan.peek())) scan.i++;
  return scan.src.slice(start, scan.i);
}

function readHex(scan, count) {
  const raw = scan.src.slice(scan.i, scan.i + count);
  if (raw.length < count || /[^0-9a-fA-F]/.test(raw)) scan.fail('bad hex escape');
  scan.i += count;
  return String.fromCharCode(parseInt(raw, 16));
}

function readStringToken(scan) {
  const q = scan.peek();
  if (q !== '"' && q !== "'") scan.fail('expected a string');
  scan.i++;
  let out = '';
  while (!scan.eof()) {
    const c = scan.peek();
    if (c === '\\') {
      const n = scan.peek(1);
      const simple = {n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"', '0': '\0', b: '\b', f: '\f', v: '\v', '/': '/'};
      if (Object.prototype.hasOwnProperty.call(simple, n)) { out += simple[n]; scan.i += 2; continue; }
      if (n === 'u') { scan.i += 2; out += readHex(scan, 4); continue; }
      if (n === 'x') { scan.i += 2; out += readHex(scan, 2); continue; }
      if (n === '\n') { scan.i += 2; continue; }
      scan.fail('unsupported string escape');
    }
    if (c === q) { scan.i++; return out; }
    if (c === '\n' || c === '\r') scan.fail('unterminated string');
    out += c;
    scan.i++;
  }
  scan.fail('unterminated string');
}

function skipRegex(scan) {
  const start = scan.i;
  scan.i++;
  let klass = false;
  while (!scan.eof()) {
    const c = scan.peek();
    if (c === '\\') { scan.i += 2; continue; }
    if (c === '\n' || c === '\r') { scan.i = start; scan.fail('unterminated regular expression'); }
    scan.i++;
    if (c === '[') klass = true;
    else if (c === ']' && klass) klass = false;
    else if (c === '/' && !klass) {
      while (/[a-z]/i.test(scan.peek())) scan.i++;
      return;
    }
  }
  scan.i = start;
  scan.fail('unterminated regular expression');
}

function newState() {
  return {brace: 0, paren: 0, bracket: 0, exprAllowed: true, stmtStart: true, canEnd: false, braceStack: [], bodyStack: [], afterArrow: false};
}

function continuesExpression(scan) {
  const c = scan.peek();
  const d = scan.peek(1);
  if (c === '.' || c === '(' || c === '[' || c === ',' || c === '?' || c === ':') return true;
  if ('+-*%&|^<>!='.includes(c)) {
    if ((c === '+' && d === '+') || (c === '-' && d === '-')) return false;
    return true;
  }
  if (c === '/') return d !== '/' && d !== '*';
  return false;
}

function defineLive(target, key, readExpr) {
  const prop = JSON.stringify(key);
  return `Object.defineProperty(${target}, ${prop}, {enumerable:true, configurable:true, get(){return ${readExpr};}});`;
}

function prepareSource(code, file) {
  if (code.charCodeAt(0) === 0xfeff) code = code.slice(1);
  if (code.startsWith('#!')) code = code.replace(/^#![^\n]*\n?/, '');
  if (code.includes('\0')) fail(`${file} contains a NUL byte and cannot be bundled`);
  return code;
}

function skipTemplate(scan, st) {
  scan.i++;
  while (!scan.eof()) {
    const c = scan.peek();
    if (c === '\\') { scan.i += 2; continue; }
    if (c === '`') { scan.i++; return; }
    if (c === '$' && scan.peek(1) === '{') {
      scan.i += 2;
      const base = st.brace;
      st.brace++;
      st.braceStack.push('temp');
      st.exprAllowed = true;
      st.stmtStart = false;
      st.canEnd = false;
      let guard = 0;
      while (!scan.eof() && st.brace > base) {
        if (++guard > 1000000) scan.fail('template expression is too large');
        consumeOne(scan, st);
      }
      if (st.brace !== base) scan.fail('unterminated template substitution');
      continue;
    }
    scan.i++;
  }
  scan.fail('unterminated template literal');
}

function consumeOne(scan, st) {
  const start = scan.i;
  const nl = skipWs(scan);
  if (scan.eof()) return {eof: true, nl};
  if (nl && st.brace === 0 && st.paren === 0 && st.bracket === 0 && st.canEnd && !continuesExpression(scan)) {
    st.exprAllowed = true;
    st.stmtStart = true;
    st.canEnd = false;
  }
  if (scan.i === start && nl === false && scan.i !== start) { /* keep lints quiet */ }
  const c = scan.peek();
  if (!c) return {eof: true, nl};
  const pendingArrow = st.afterArrow;
  st.afterArrow = false;
  if (c === '`' ) { skipTemplate(scan, st); st.exprAllowed = false; st.canEnd = true; st.stmtStart = false; return {type: 'template'}; }
  if (c === '"' || c === "'") { readStringToken(scan); st.exprAllowed = false; st.canEnd = true; st.stmtStart = false; return {type: 'string'}; }
  if (c === '/' && scan.peek(1) !== '/' && scan.peek(1) !== '*' && st.exprAllowed) {
    skipRegex(scan);
    st.exprAllowed = false;
    st.canEnd = true;
    st.stmtStart = false;
    return {type: 'regex'};
  }
  if (c === '/' && (scan.peek(1) === '/' || scan.peek(1) === '*')) {
    skipWs(scan);
    return consumeOne(scan, st);
  }
  if (c === '0' && /[xXoObB]/.test(scan.peek(1))) {
    scan.i += 2;
    while (/[0-9a-fA-F_]/.test(scan.peek())) scan.i++;
    if (scan.peek() === 'n') scan.i++;
    st.exprAllowed = false; st.canEnd = true; st.stmtStart = false;
    return {type: 'num'};
  }
  if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(scan.peek(1)))) {
    if (c !== '.') { while (/[0-9_]/.test(scan.peek())) scan.i++; }
    if (scan.peek() === '.' && /[0-9]/.test(scan.peek(1))) { scan.i++; while (/[0-9_]/.test(scan.peek())) scan.i++; }
    if (scan.peek() === 'e' || scan.peek() === 'E') {
      scan.i++;
      if (scan.peek() === '+' || scan.peek() === '-') scan.i++;
      while (/[0-9_]/.test(scan.peek())) scan.i++;
    }
    if (scan.peek() === 'n') scan.i++;
    st.exprAllowed = false; st.canEnd = true; st.stmtStart = false;
    return {type: 'num'};
  }
  if (isIdentStart(c)) {
    const ident = readIdent(scan);
    const wasExpr = st.exprAllowed;
    const wasStmt = st.stmtStart;
    const prefix = wasExpr && (ident === 'return' || ident === 'case' || ident === 'throw' || ident === 'else' || ident === 'do' || ident === 'try' || ident === 'finally' || ident === 'typeof' || ident === 'void' || ident === 'delete' || ident === 'new' || ident === 'yield' || ident === 'await' || ident === 'debugger' || ident === 'class' || ident === 'function' || ident === 'if' || ident === 'for' || ident === 'while' || ident === 'switch' || ident === 'catch' || ident === 'var' || ident === 'let' || ident === 'const' || ident === 'extends' || ident === 'in' || ident === 'of' || ident === 'instanceof');
    if ((ident === 'function' || ident === 'class') && (wasExpr || wasStmt)) st.bodyStack.push({paren: st.paren, brace: st.brace});
    if (ident === 'else' || ident === 'do' || ident === 'try' || ident === 'finally') {
      st.exprAllowed = true;
      st.stmtStart = true;
      st.canEnd = false;
      return {type: 'kw', value: ident};
    }
    st.exprAllowed = prefix;
    st.canEnd = !prefix;
    st.stmtStart = false;
    return {type: 'ident', value: ident};
  }
  const two = c + scan.peek(1);
  if (two === '=>') {
    scan.i += 2;
    st.afterArrow = true;
    st.exprAllowed = true;
    st.canEnd = false;
    st.stmtStart = false;
    return {type: 'arrow'};
  }
  if (two === '?.' || two === '??' || two === '&&' || two === '||' || two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '++' || two === '--' || two === '+=' || two === '-=' || two === '*=' || two === '/=' || two === '%=' || two === '**' || two === '<<' || two === '>>') {
    const op = (two === '>>' && scan.peek(2) === '>') || (two === '==' && scan.peek(2) === '=') || (two === '!=' && scan.peek(2) === '=') || (two === '<<' && scan.peek(2) === '=') || (two === '>>' && scan.peek(2) === '=') || (two === '**' && scan.peek(2) === '=') || (two === '&&' && scan.peek(2) === '=') || (two === '||' && scan.peek(2) === '=') || (two === '??' && scan.peek(2) === '=')
      ? two + scan.peek(2) : two;
    const prefix = st.exprAllowed && (op === '++' || op === '--');
    scan.i += op.length;
    if (op === '++' || op === '--') {
      st.exprAllowed = prefix;
      st.canEnd = !prefix;
    } else {
      st.exprAllowed = true;
      st.canEnd = false;
    }
    st.stmtStart = false;
    return {type: 'op', value: op};
  }
  scan.i++;
  if (c === '{') {
    const top = st.bodyStack[st.bodyStack.length - 1];
    let kind = 'obj';
    if (top && st.paren === top.paren && st.brace === top.brace) { st.bodyStack.pop(); kind = 'func'; }
    else if (pendingArrow) kind = 'arrow';
    else if (st.stmtStart || !st.exprAllowed) kind = 'block';
    st.brace++;
    st.braceStack.push(kind);
    if (kind === 'block') { st.exprAllowed = true; st.stmtStart = true; st.canEnd = false; }
    else if (kind === 'obj') { st.exprAllowed = true; st.stmtStart = false; st.canEnd = false; }
    else { st.exprAllowed = true; st.stmtStart = true; st.canEnd = false; }
    return {type: kind};
  }
  if (c === '}') {
    st.brace = Math.max(0, st.brace - 1);
    const kind = st.braceStack.pop() || 'block';
    if (kind === 'temp') { st.exprAllowed = true; st.canEnd = false; }
    else if (kind === 'obj' || kind === 'func' || kind === 'arrow') { st.exprAllowed = false; st.stmtStart = false; st.canEnd = true; }
    else { st.exprAllowed = true; st.stmtStart = true; st.canEnd = false; }
    return {type: kind};
  }
  if (c === '(') { st.paren++; st.exprAllowed = true; st.canEnd = false; st.stmtStart = false; st.afterArrow = false; return {type: 'paren'}; }
  if (c === ')') { st.paren = Math.max(0, st.paren - 1); st.exprAllowed = false; st.canEnd = true; st.stmtStart = false; return {type: 'paren-close'}; }
  if (c === '[') { st.bracket++; st.exprAllowed = true; st.canEnd = false; st.stmtStart = false; return {type: 'brack'}; }
  if (c === ']') { st.bracket = Math.max(0, st.bracket - 1); st.exprAllowed = false; st.canEnd = true; st.stmtStart = false; return {type: 'brack-close'}; }
  if (c === ';') { st.exprAllowed = true; st.stmtStart = true; st.canEnd = false; return {type: 'semi'}; }
  if (c === ',' || c === '?' || c === ':' || c === '=' || c === '<' || c === '>' || c === '+' || c === '-' || c === '*' || c === '/' || c === '%' || c === '&' || c === '|' || c === '^' || c === '!' || c === '~') {
    const prefix = st.exprAllowed && (c === '+' || c === '-' || c === '!' || c === '~');
    if (prefix) { st.exprAllowed = true; st.canEnd = false; }
    else if (c === '!' || c === '~') { st.exprAllowed = true; st.canEnd = false; }
    else { st.exprAllowed = true; st.canEnd = false; }
    st.stmtStart = false;
    return {type: 'op', value: c};
  }
  if (c === '#' && isIdentStart(scan.peek())) { readIdent(scan); st.exprAllowed = false; st.canEnd = false; st.stmtStart = false; return {type: 'private'}; }
  if (c === '.') { st.exprAllowed = true; st.canEnd = false; st.stmtStart = false; return {type: 'dot'}; }
  scan.fail(`unsupported token ${JSON.stringify(c)}`);
}

function skipExpression(scan, st, opts = {}) {
  const b0 = st.brace, p0 = st.paren, k0 = st.bracket;
  st.exprAllowed = true;
  st.stmtStart = false;
  st.canEnd = false;
  let guard = 0;
  while (!scan.eof()) {
    if (++guard > 1000000) scan.fail('expression is too large');
    const mark = scan.i;
    const nl = skipWs(scan);
    if (scan.eof()) { scan.i = mark; return; }
    if (st.brace === b0 && st.paren === p0 && st.bracket === k0 && scan.peek() === ';') { scan.i = mark; return; }
    if (st.brace === b0 && st.paren === p0 && st.bracket === k0 && st.canEnd) {
      const c = scan.peek();
      if (opts.commaStops && c === ',') { scan.i = mark; return; }
      if (opts.closeStops && (c === '}' || c === ']')) { scan.i = mark; return; }
      if (opts.braceStops && c === '{') { scan.i = mark; return; }
      if (nl && !continuesExpression(scan)) { scan.i = mark; return; }
    } else if (st.brace === b0 && st.paren === p0 && st.bracket === k0 && opts.closeStops && (scan.peek() === '}' || scan.peek() === ']') && st.canEnd) {
      scan.i = mark;
      return;
    }
    scan.i = mark;
    const before = scan.i;
    consumeOne(scan, st);
    if (scan.i <= before) scan.fail('parser did not advance');
  }
}

function readPattern(scan, st, names) {
  skipWs(scan);
  const c = scan.peek();
  if (c === '{') { readObjectPattern(scan, st, names); return; }
  if (c === '[') { readArrayPattern(scan, st, names); return; }
  if (isIdentStart(c)) { names.push(readIdent(scan)); return; }
  scan.fail('expected a binding pattern');
}

function readObjectPattern(scan, st, names) {
  if (scan.peek() !== '{') scan.fail('expected {');
  scan.i++;
  while (!scan.eof()) {
    skipWs(scan);
    if (scan.peek() === '}') { scan.i++; return; }
    if (scan.peek() === ',') { scan.i++; continue; }
    if (scan.startsWith('...')) {
      scan.i += 3;
      skipWs(scan);
      names.push(readIdent(scan));
      continue;
    }
    let shorthand = null;
    if (scan.peek() === '[') {
      const baseB = st.brace, baseP = st.paren, baseK = st.bracket;
      consumeOne(scan, st);
      while (!scan.eof() && !(st.brace === baseB && st.paren === baseP && st.bracket === baseK && scan.peek() === ']')) consumeOne(scan, st);
      if (scan.peek() === ']') scan.i++;
    } else if (scan.peek() === '"' || scan.peek() === "'") readStringToken(scan);
    else shorthand = readIdent(scan);
    skipWs(scan);
    if (shorthand && scan.peek() !== ':') {
      names.push(shorthand);
      if (scan.peek() === '=') { scan.i++; skipExpression(scan, st, {commaStops: true, closeStops: true}); }
    } else {
      if (scan.peek() !== ':') scan.fail('expected : in a binding pattern');
      scan.i++;
      readPattern(scan, st, names);
      skipWs(scan);
      if (scan.peek() === '=') { scan.i++; skipExpression(scan, st, {commaStops: true, closeStops: true}); }
    }
    skipWs(scan);
    if (scan.peek() === ',') { scan.i++; continue; }
    if (scan.peek() === '}') { scan.i++; return; }
  }
  scan.fail('unterminated object pattern');
}

function readArrayPattern(scan, st, names) {
  if (scan.peek() !== '[') scan.fail('expected [');
  scan.i++;
  while (!scan.eof()) {
    skipWs(scan);
    if (scan.peek() === ']') { scan.i++; return; }
    if (scan.peek() === ',') { scan.i++; continue; }
    if (scan.startsWith('...')) { scan.i += 3; skipWs(scan); names.push(readIdent(scan)); continue; }
    readPattern(scan, st, names);
    skipWs(scan);
    if (scan.peek() === '=') { scan.i++; skipExpression(scan, st, {commaStops: true, closeStops: true}); }
    skipWs(scan);
    if (scan.peek() === ',') { scan.i++; continue; }
    if (scan.peek() === ']') { scan.i++; return; }
  }
  scan.fail('unterminated array pattern');
}

function parseNamedList(scan) {
  if (scan.peek() !== '{') scan.fail('expected {');
  scan.i++;
  const names = [];
  while (!scan.eof()) {
    skipWs(scan);
    if (scan.peek() === '}') { scan.i++; break; }
    if (scan.peek() === ',') { scan.i++; continue; }
    let imported;
    if (scan.peek() === '"' || scan.peek() === "'") imported = readStringToken(scan);
    else imported = readIdent(scan);
    skipWs(scan);
    let exported = imported;
    if (matchKeyword(scan, 'as')) {
      scan.i += 2;
      skipWs(scan);
      if (scan.peek() === '"' || scan.peek() === "'") exported = readStringToken(scan);
      else exported = readIdent(scan);
    }
    names.push({imported, exported});
    skipWs(scan);
    if (scan.peek() === ',') { scan.i++; continue; }
    if (scan.peek() === '}') { scan.i++; break; }
    scan.fail('bad export or import list');
  }
  return names;
}

function skipImportAttributes(scan) {
  skipWs(scan);
  if (matchKeyword(scan, 'with') || matchKeyword(scan, 'assert')) {
    scan.i += matchKeyword(scan, 'with') ? 4 : 6;
    skipWs(scan);
    if (scan.peek() !== '{') scan.fail('expected import attributes');
    const st = newState();
    const base = st.brace;
    consumeOne(scan, st);
    while (!scan.eof() && st.brace > base) consumeOne(scan, st);
  }
}

function optionalSemi(scan) {
  const mark = scan.i;
  skipWs(scan);
  if (scan.peek() === ';') { scan.i++; return; }
  scan.i = mark;
}

function parseImport(scan, start) {
  scan.i = start + 6;
  skipWs(scan);
  if (scan.peek() === '(') return null;
  const bindings = [];
  let namespace = null;
  let defaultName = null;
  let side = false;
  if (scan.peek() === '"' || scan.peek() === "'") {
    const spec = readStringToken(scan);
    skipImportAttributes(scan);
    optionalSemi(scan);
    return {start, end: scan.i, spec, bindings, namespace, defaultName, side: true};
  }
  if (scan.peek() === '*') {
    scan.i++;
    skipWs(scan);
    if (!matchKeyword(scan, 'as')) scan.fail('expected * as');
    scan.i += 2;
    skipWs(scan);
    namespace = readIdent(scan);
  } else if (scan.peek() === '{') {
    for (const name of parseNamedList(scan)) bindings.push({imported: name.imported, local: name.exported});
  } else {
    defaultName = readIdent(scan);
    skipWs(scan);
    if (scan.peek() === ',') {
      scan.i++;
      skipWs(scan);
      if (scan.peek() === '*') {
        scan.i++;
        skipWs(scan);
        if (!matchKeyword(scan, 'as')) scan.fail('expected as');
        scan.i += 2;
        skipWs(scan);
        namespace = readIdent(scan);
      } else if (scan.peek() === '{') {
        for (const name of parseNamedList(scan)) bindings.push({imported: name.imported, local: name.exported});
      } else scan.fail('bad import clause');
    }
  }
  skipWs(scan);
  if (!matchKeyword(scan, 'from')) scan.fail('expected from');
  scan.i += 4;
  skipWs(scan);
  const spec = readStringToken(scan);
  skipImportAttributes(scan);
  optionalSemi(scan);
  return {start, end: scan.i, spec, bindings, namespace, defaultName, side};
}

function assignmentFor(varKind, name) {
  if (varKind === 'let' || varKind === 'var') return defineLive('__ff_exports', name, name);
  return `__ff_exports[${JSON.stringify(name)}] = ${name};`;
}

function parseExport(scan, st, start) {
  scan.i = start + 6;
  skipWs(scan);
  if (scan.peek() === '*') {
    scan.i++;
    skipWs(scan);
    let ns = null;
    if (matchKeyword(scan, 'as')) {
      scan.i += 2;
      skipWs(scan);
      ns = readIdent(scan);
      skipWs(scan);
    }
    if (!matchKeyword(scan, 'from')) scan.fail('expected from');
    scan.i += 4;
    skipWs(scan);
    const spec = readStringToken(scan);
    skipImportAttributes(scan);
    optionalSemi(scan);
    return {start, end: scan.i, star: true, spec, ns};
  }
  if (scan.peek() === '{') {
    const names = parseNamedList(scan);
    skipWs(scan);
    let spec = null;
    if (matchKeyword(scan, 'from')) {
      scan.i += 4;
      skipWs(scan);
      spec = readStringToken(scan);
      skipImportAttributes(scan);
    }
    optionalSemi(scan);
    return {start, end: scan.i, names, spec, list: true};
  }
  if (matchKeyword(scan, 'default')) {
    scan.i += 7;
    skipWs(scan);
    const exprAt = scan.i;
    const defaultDecl = readDefaultDecl(scan, st);
    if (!defaultDecl) skipExpression(scan, st, {});
    optionalSemi(scan);
    return {start, end: scan.i, defaultExport: !defaultDecl, defaultDecl, exprAt};
  }
  let asyncPos = -1;
  if (matchKeyword(scan, 'async')) {
    const mark = scan.i;
    scan.i += 5;
    const ws = skipWs(scan);
    if (matchKeyword(scan, 'function')) asyncPos = mark;
    else scan.i = mark;
    void ws;
  }
  if (asyncPos >= 0 || matchKeyword(scan, 'function')) {
    if (asyncPos >= 0) {
      scan.i = asyncPos + 5;
      skipWs(scan);
    }
    scan.i += 8;
    skipWs(scan);
    if (scan.peek() === '*') { scan.i++; skipWs(scan); }
    if (!isIdentStart(scan.peek())) scan.fail('exported functions need a name');
    const name = readIdent(scan);
    skipWs(scan);
    if (scan.peek() !== '(') scan.fail('expected function parameters');
    const st2 = newState();
    consumeOne(scan, st2);
    while (!scan.eof() && st2.paren > 0) consumeOne(scan, st2);
    skipWs(scan);
    if (scan.peek() !== '{') scan.fail('expected a function body');
    consumeOne(scan, st2);
    while (!scan.eof() && st2.brace > 0) consumeOne(scan, st2);
    optionalSemi(scan);
    return {start, end: scan.i, fn: name, keywordEnd: start + 6};
  }
  if (matchKeyword(scan, 'class')) {
    scan.i += 5;
    skipWs(scan);
    if (!isIdentStart(scan.peek())) scan.fail('exported classes need a name');
    const name = readIdent(scan);
    skipWs(scan);
    if (matchKeyword(scan, 'extends')) {
      scan.i += 7;
      skipExpression(scan, st, {braceStops: true});
      skipWs(scan);
    }
    if (scan.peek() !== '{') scan.fail('expected a class body');
    const st2 = newState();
    consumeOne(scan, st2);
    while (!scan.eof() && st2.brace > 0) consumeOne(scan, st2);
    optionalSemi(scan);
    return {start, end: scan.i, klass: name, keywordEnd: start + 6};
  }
  if (matchKeyword(scan, 'const') || matchKeyword(scan, 'let') || matchKeyword(scan, 'var')) {
    const varKind = readIdent(scan);
    const names = [];
    while (!scan.eof()) {
      readPattern(scan, st, names);
      skipWs(scan);
      if (scan.peek() === '=') { scan.i++; skipExpression(scan, st, {commaStops: true}); }
      const mark = scan.i;
      skipWs(scan);
      if (scan.peek() === ',') { scan.i++; continue; }
      scan.i = mark;
      break;
    }
    optionalSemi(scan);
    return {start, end: scan.i, varKind, bound: names, keywordEnd: start + 6};
  }
  scan.fail('unsupported export');
}

function consumeFunctionFromKeyword(scan) {
  scan.i += 8;
  skipWs(scan);
  if (scan.peek() === '*') { scan.i++; skipWs(scan); }
  let name = null;
  if (isIdentStart(scan.peek())) name = readIdent(scan);
  skipWs(scan);
  if (scan.peek() !== '(') scan.fail('expected function parameters');
  const st2 = newState();
  consumeOne(scan, st2);
  while (!scan.eof() && st2.paren > 0) consumeOne(scan, st2);
  skipWs(scan);
  if (scan.peek() !== '{') scan.fail('expected a function body');
  consumeOne(scan, st2);
  while (!scan.eof() && st2.brace > 0) consumeOne(scan, st2);
  return name;
}

function consumeClassFromKeyword(scan, st) {
  scan.i += 5;
  skipWs(scan);
  let name = null;
  if (isIdentStart(scan.peek()) && !matchKeyword(scan, 'extends')) name = readIdent(scan);
  skipWs(scan);
  if (matchKeyword(scan, 'extends')) {
    scan.i += 7;
    skipExpression(scan, st, {braceStops: true});
    skipWs(scan);
  }
  if (scan.peek() !== '{') scan.fail('expected a class body');
  const st2 = newState();
  consumeOne(scan, st2);
  while (!scan.eof() && st2.brace > 0) consumeOne(scan, st2);
  return name;
}

function readDefaultDecl(scan, st) {
  const mark = scan.i;
  if (matchKeyword(scan, 'async')) {
    scan.i += 5;
    skipWs(scan);
    if (!matchKeyword(scan, 'function')) { scan.i = mark; return null; }
    return {kind: 'fn', name: consumeFunctionFromKeyword(scan)};
  }
  if (matchKeyword(scan, 'function')) return {kind: 'fn', name: consumeFunctionFromKeyword(scan)};
  if (matchKeyword(scan, 'class')) return {kind: 'class', name: consumeClassFromKeyword(scan, st)};
  return null;
}

function parseDynamicImport(scan, start) {
  scan.i = start + 6;
  skipWs(scan);
  if (scan.peek() !== '(') { scan.i = start; return null; }
  scan.i++;
  skipWs(scan);
  if (scan.peek() !== '"' && scan.peek() !== "'") {
    scan.fail('dynamic import() in the standalone bundle needs a static string specifier');
  }
  const spec = readStringToken(scan);
  skipWs(scan);
  if (scan.peek() !== ')') scan.fail('dynamic import() must be a single static specifier');
  scan.i++;
  return {start, end: scan.i, spec};
}

function transformModule(code, file, resolve) {
  code = prepareSource(code, file);
  const scan = new Scan(code, file);
  const st = newState();
  const edits = [];
  const imports = [];
  const hoisted = [];
  const css = [];
  const eager = [];
  const lazy = [];
  let guard = 0;
  while (!scan.eof()) {
    if (++guard > 1000000) scan.fail('module is too large');
    const mark = scan.i;
    const nl = skipWs(scan);
    if (scan.eof()) break;
    if (nl && st.brace === 0 && st.paren === 0 && st.bracket === 0 && st.canEnd && !continuesExpression(scan)) {
      st.exprAllowed = true;
      st.stmtStart = true;
      st.canEnd = false;
    }
    const atStmt = st.brace === 0 && st.paren === 0 && st.bracket === 0 && st.stmtStart;
    const afterImport = scan.src.slice(scan.i + 6, scan.i + 24);
    const importCall = /^\s*\(/.test(afterImport);
    const importMeta = /^\s*\./.test(afterImport);
    if (atStmt && matchKeyword(scan, 'import') && !importCall && !importMeta) {
      const parsed = parseImport(scan, scan.i);
      if (!parsed) scan.fail('import was not parsed');
      const resolved = resolve(parsed.spec, file);
      edits.push({start: parsed.start, end: parsed.end, text: ''});
      if (resolved.kind === 'css') {
        css.push(resolved.id);
        imports.push({css: true, id: resolved.id});
      } else {
        eager.push(resolved.id);
        imports.push({id: resolved.id, bindings: parsed.bindings, namespace: parsed.namespace, defaultName: parsed.defaultName, side: parsed.side});
      }
      st.exprAllowed = true;
      st.stmtStart = true;
      st.canEnd = false;
      continue;
    }
    if (matchKeyword(scan, 'import')) {
      const look = scan.i;
      const dyn = parseDynamicImport(scan, look);
      if (dyn) {
        const resolved = resolve(dyn.spec, file);
        if (resolved.kind === 'css') scan.fail(`CSS cannot be loaded with import(): ${dyn.spec}`);
        lazy.push(resolved.id);
        edits.push({start: dyn.start, end: dyn.end, text: `__ff_dyn(${JSON.stringify(resolved.id)})`});
        st.exprAllowed = false;
        st.canEnd = true;
        st.stmtStart = false;
        continue;
      }
    }
    if (atStmt && matchKeyword(scan, 'export')) {
      const parsed = parseExport(scan, st, scan.i);
      let resume = null;
      if (parsed.star) {
        const resolved = resolve(parsed.spec, file);
        if (resolved.kind !== 'js' && resolved.kind !== 'json' && resolved.kind !== 'asset') scan.fail(`cannot re-export ${parsed.spec}`);
        eager.push(resolved.id);
        edits.push({start: parsed.start, end: parsed.end, text: starText(parsed, resolved.id)});
      } else if (parsed.list) {
        if (parsed.spec) {
          const resolved = resolve(parsed.spec, file);
          eager.push(resolved.id);
          const bits = parsed.names.map(name => defineLive('__ff_exports', name.exported, `__ff_load(${JSON.stringify(resolved.id)})[${JSON.stringify(name.imported)}]`));
          edits.push({start: parsed.start, end: parsed.end, text: bits.join('\n')});
        } else {
          const bits = parsed.names.map(name => defineLive('__ff_exports', name.exported, name.imported));
          edits.push({start: parsed.start, end: parsed.end, text: bits.join('\n')});
        }
      } else if (parsed.defaultDecl?.name && parsed.defaultDecl.kind === 'fn') {
        edits.push({start: parsed.start, end: parsed.exprAt, text: ''});
        hoisted.push(`__ff_exports.default = ${parsed.defaultDecl.name};`);
        resume = parsed.exprAt;
      } else if (parsed.defaultDecl?.name && parsed.defaultDecl.kind === 'class') {
        edits.push({start: parsed.start, end: parsed.exprAt, text: ''});
        edits.push({start: parsed.end, end: parsed.end, text: `\n__ff_exports.default = ${parsed.defaultDecl.name};\n`});
        resume = parsed.exprAt;
      } else if (parsed.defaultDecl || parsed.defaultExport) {
        edits.push({start: parsed.start, end: parsed.exprAt, text: '__ff_exports.default = '});
        resume = parsed.exprAt;
      } else if (parsed.fn) {
        let j = parsed.keywordEnd;
        while (j < code.length && /\s/.test(code[j])) j++;
        edits.push({start: parsed.start, end: j, text: ''});
        hoisted.push(`__ff_exports[${JSON.stringify(parsed.fn)}] = ${parsed.fn};`);
        resume = j;
      } else if (parsed.klass) {
        let j = parsed.keywordEnd;
        while (j < code.length && /\s/.test(code[j])) j++;
        edits.push({start: parsed.start, end: j, text: ''});
        edits.push({start: parsed.end, end: parsed.end, text: `\n__ff_exports[${JSON.stringify(parsed.klass)}] = ${parsed.klass};\n`});
        resume = j;
      } else if (parsed.varKind) {
        let j = parsed.keywordEnd;
        while (j < code.length && /\s/.test(code[j])) j++;
        edits.push({start: parsed.start, end: j, text: ''});
        const bits = parsed.bound.map(name => assignmentFor(parsed.varKind, name));
        edits.push({start: parsed.end, end: parsed.end, text: `\n${bits.join('\n')}\n`});
        resume = j;
      } else scan.fail('export was not rewritten');
      st.brace = 0; st.paren = 0; st.bracket = 0; st.braceStack = []; st.bodyStack = [];
      st.exprAllowed = true; st.stmtStart = resume == null;
      st.canEnd = false;
      if (resume != null) scan.i = resume;
      continue;
    }
    if (matchKeyword(scan, 'import') && scan.src.slice(scan.i).match(/^import\s*\.\s*meta\b/)) {
      const begin = scan.i;
      scan.i += 6;
      skipWs(scan);
      if (scan.peek() !== '.') scan.fail('expected import.meta');
      scan.i++;
      skipWs(scan);
      if (!matchKeyword(scan, 'meta')) scan.fail('expected import.meta');
      scan.i += 4;
      const after = scan.i;
      skipWs(scan);
      if (scan.peek() === '.' ) {
        const dot = scan.i;
        scan.i++;
        skipWs(scan);
        if (matchKeyword(scan, 'url')) {
          scan.i += 3;
          edits.push({start: begin, end: scan.i, text: '(typeof document==="undefined"?"":document.baseURI)'});
        } else {
          scan.i = dot;
          edits.push({start: begin, end: after, text: '({url:(typeof document==="undefined"?"":document.baseURI)})'});
        }
      } else {
        scan.i = after;
        edits.push({start: begin, end: after, text: '({url:(typeof document==="undefined"?"":document.baseURI)})'});
      }
      st.exprAllowed = false;
      st.canEnd = true;
      st.stmtStart = false;
      continue;
    }
    scan.i = mark;
    const before = scan.i;
    consumeOne(scan, st);
    if (scan.i <= before) scan.fail('parser did not advance');
  }
  const edited = applyEdits(code, edits);
  assertNoModuleSyntax(edited, file);
  const loadLines = [];
  const bindLines = [];
  const seen = new Map();
  function tmpFor(id) {
    if (!seen.has(id)) {
      const name = `__ff_m${seen.size}`;
      seen.set(id, name);
      loadLines.push(`const ${name} = __ff_load(${JSON.stringify(id)});`);
    }
    return seen.get(id);
  }
  for (const id of eager) tmpFor(id);
  for (const imp of imports) {
    if (imp.css) continue;
    const tmp = tmpFor(imp.id);
    if (imp.namespace) bindLines.push(`const ${imp.namespace} = ${tmp};`);
    if (imp.defaultName) bindLines.push(`const ${imp.defaultName} = ${tmp}.default;`);
    for (const binding of imp.bindings || []) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(binding.local)) fail(`${file} has an import binding that is not a plain identifier`);
      bindLines.push(`const ${binding.local} = ${tmp}[${JSON.stringify(binding.imported)}];`);
    }
  }
  const header = ['"use strict";', ...hoisted, ...loadLines, ...bindLines].filter(Boolean).join('\n');
  const body = `${header}\n${edited}\n`;
  try { new Function('__ff_exports', '__ff_load', body); }
  catch (error) {
    fail(`Bundled syntax check failed for ${file}: ${error.message}`);
  }
  return {body, css, deps: [...new Set([...eager, ...lazy])], lazy: [...new Set(lazy)]};
}

function starText(parsed, id) {
  const load = `__ff_load(${JSON.stringify(id)})`;
  if (parsed.ns) return defineLive('__ff_exports', parsed.ns, load);
  return `(()=>{const __ff_src=${load};for(const __ff_k of Object.keys(__ff_src)){if(__ff_k==="default")continue;if(Object.prototype.propertyIsEnumerable.call(__ff_exports,__ff_k))continue;Object.defineProperty(__ff_exports,__ff_k,{enumerable:true,configurable:true,get(){return __ff_src[__ff_k];}});}})();`;
}

function applyEdits(source, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = source;
  let cursor = source.length;
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end > out.length || edit.start > edit.end || edit.end > cursor) {
      fail(`internal bundler edit overlap at ${edit.start}-${edit.end}`);
    }
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    cursor = edit.start;
  }
  return out;
}

function assertNoModuleSyntax(code, file) {
  const scan = new Scan(code, file);
  const st = newState();
  let prev = '';
  let guard = 0;
  while (!scan.eof()) {
    if (++guard > 1000000) break;
    const before = scan.i;
    skipWs(scan);
    if (scan.eof()) break;
    if (matchKeyword(scan, 'import') || matchKeyword(scan, 'export')) {
      if (prev !== '.') scan.fail('bundler left an import or export keyword in the output');
    }
    scan.i = before;
    const token = consumeOne(scan, st);
    prev = token && (token.type === 'dot' || token.value === '?.') ? '.' : token && token.type;
    if (scan.i <= before) break;
  }
}

function joinId(fromId, spec) {
  if (spec.startsWith('http:') || spec.startsWith('https:') || spec.startsWith('//') || spec.startsWith('data:') || spec.startsWith('node:')) {
    fail(`External or non-local import ${JSON.stringify(spec)} from ${fromId} cannot be in the standalone build`);
  }
  if (!spec.startsWith('.')) fail(`Bare import ${JSON.stringify(spec)} from ${fromId} cannot be bundled. The browser build stays dependency-free.`);
  const dir = fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/')) : '';
  const raw = `${dir ? `${dir}/` : ''}${spec}`;
  const parts = [];
  for (const part of raw.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!parts.length) fail(`Import escapes the project: ${spec} from ${fromId}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

function kindOf(id) {
  const ext = path.posix.extname(id).toLowerCase();
  if (JS_EXT.has(ext)) return 'js';
  if (JSON_EXT.has(ext)) return 'json';
  if (CSS_EXT.has(ext)) return 'css';
  if (ASSET_EXT.has(ext)) return 'asset';
  return '';
}

function resolveSpec(fromId, spec, exists) {
  const joined = joinId(fromId, spec.split(/[?#]/)[0]);
  const ext = path.posix.extname(joined).toLowerCase();
  const candidates = [joined];
  if (!ext) candidates.push(`${joined}.js`, `${joined}/index.js`);
  else if (ext === '.js') candidates.push(`${joined.slice(0, -3)}/index.js`);
  for (const candidate of candidates) {
    if (exists(candidate)) {
      const kind = kindOf(candidate);
      if (!kind) fail(`Unsupported runtime asset ${candidate} imported from ${fromId}`);
      return {id: candidate, kind};
    }
  }
  fail(`Cannot resolve ${JSON.stringify(spec)} from ${fromId}. Tried ${candidates.join(', ')}`);
}

function helperPrefix(sources) {
  const blob = sources.join('\n');
  if (blob.includes('__ff_')) return '__ffx_';
  return '__ff_';
}

function rewriteHelpers(js, prefix) {
  if (prefix === '__ff_') return js;
  return js.replace(/__ff_/g, prefix);
}

function renderRuntime(factories, entry, options = {}) {
  const ids = Object.keys(factories).sort();
  const prefix = options.prefix || '__ff_';
  let js = `(() => {\n"use strict";\nconst ${prefix}factories = Object.create(null);\nconst ${prefix}cache = Object.create(null);\nfunction ${prefix}load(id) {\n  const hit = ${prefix}cache[id];\n  if (hit) return hit.exports;\n  const factory = ${prefix}factories[id];\n  if (!factory) throw new Error("Fencefall bundle missing module: " + id);\n  const rec = ${prefix}cache[id] = {exports: Object.create(null)};\n  try { factory.call(undefined, rec.exports, ${prefix}load); }\n  catch (error) { delete ${prefix}cache[id]; throw error; }\n  return rec.exports;\n}\nfunction ${prefix}dyn(id) { return Promise.resolve().then(() => ${prefix}load(id)); }\n`;
  for (const id of ids) {
    const body = rewriteHelpers(factories[id], prefix).replace(/__ff_dyn\b/g, `${prefix}dyn`);
    js += `${prefix}factories[${JSON.stringify(id)}] = function(${prefix}exports, ${prefix}load) {\n${body}};\n`;
  }
  js += `${prefix}load(${JSON.stringify(entry)});\n`;
  if (options.capture) js += `globalThis.__ff_capture = ${prefix}load(${JSON.stringify(entry)});\n`;
  js += '})();\n';
  return js;
}

function bundleGraph(entry, read, exists) {
  const factories = Object.create(null);
  const raws = [];
  const cssIds = [];
  const warnings = [];
  const visiting = new Set();
  function visit(id, stack) {
    if (Object.prototype.hasOwnProperty.call(factories, id)) {
      if (stack.includes(id)) warnings.push(`Import cycle: ${stack.slice(stack.indexOf(id)).concat(id).join(' -> ')}`);
      return;
    }
    if (visiting.has(id)) {
      warnings.push(`Import cycle: ${stack.concat(id).join(' -> ')}`);
      return;
    }
    visiting.add(id);
    const loaded = read(id);
    raws.push(loaded.text || '');
    if (loaded.kind === 'json') {
      let value;
      try { value = JSON.parse(loaded.text); }
      catch (error) { fail(`Invalid JSON module ${id}: ${error.message}`); }
      factories[id] = `"use strict";\n__ff_exports.default = ${JSON.stringify(value)};\n`;
    } else if (loaded.kind === 'asset') {
      factories[id] = `"use strict";\n__ff_exports.default = ${JSON.stringify(loaded.dataUri)};\n`;
    } else if (loaded.kind === 'js') {
      const transformed = transformModule(loaded.text, id, (spec) => resolveSpec(id, spec, exists));
      factories[id] = transformed.body;
      for (const dep of transformed.deps) visit(dep, stack.concat(id));
      for (const sheet of transformed.css) if (!cssIds.includes(sheet)) cssIds.push(sheet);
    } else fail(`Cannot bundle ${id} as JavaScript`);
    visiting.delete(id);
  }
  visit(entry, []);
  const prefix = helperPrefix(raws);
  return {factories, cssIds, warnings, prefix, entry};
}

function inlineCss(css, fromId, readText, exists, seen = new Set()) {
  if (seen.has(fromId)) return '';
  seen.add(fromId);
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) fail(`Unterminated comment in ${fromId}`);
      out += css.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (css.startsWith('@import', i) && /[\s\n]/.test(css[i + 7] || '')) {
      const slice = css.slice(i);
      const match = /^@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?[^;]*;/.exec(slice);
      if (!match) fail(`Unsupported @import in ${fromId}`);
      const spec = match[2];
      if (/^(https?:)?\/\//.test(spec) || spec.startsWith('http:') || spec.startsWith('https:')) fail(`External CSS @import is not allowed (${spec} in ${fromId})`);
      const id = joinId(fromId, spec);
      if (!exists(id)) fail(`Missing CSS @import ${spec} from ${fromId}`);
      out += inlineCss(readText(id), id, readText, exists, seen);
      i += match[0].length;
      continue;
    }
    if (css.startsWith('url(', i)) {
      const end = css.indexOf(')', i);
      if (end < 0) fail(`Unterminated url() in ${fromId}`);
      const raw = css.slice(i + 4, end).trim().replace(/^['"]|['"]$/g, '');
      if (raw === '' || raw.startsWith('data:') || raw.startsWith('#')) { out += css.slice(i, end + 1); i = end + 1; continue; }
      if (/^(https?:)?\/\//.test(raw) || raw.startsWith('http:') || raw.startsWith('https:')) fail(`External CSS url() is not allowed (${raw} in ${fromId})`);
      const id = joinId(fromId, raw);
      if (!exists(id)) fail(`Missing CSS asset ${raw} from ${fromId}`);
      out += `url(${JSON.stringify(dataUriFor(id, fs.readFileSync(path.join(ROOT, id))))})`;
      // dataUriFor uses ROOT only for disk builds. Virtual CSS tests pass exists/read and avoid url files.
      i = end + 1;
      continue;
    }
    out += css[i];
    i++;
  }
  return out;
}

function dataUriFor(id, buf) {
  const ext = path.posix.extname(id).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
}

function inlineCssFiles(ids, readText, exists, readBinary) {
  const seen = new Set();
  let css = '';
  for (const id of ids) {
    if (seen.has(id)) continue;
    const text = inlineCss(readText(id), id, readText, exists, seen);
    css += `/* ${id} */\n${text}\n`;
  }
  return css.replace(/url\("data:/g, 'url("data:').replace(/<\/(style)/gi, '<\\/$1');
}

function escapeStyle(css) { return css.replace(/<\/(style)/gi, '<\\/$1'); }
function escapeScript(js) { return js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--'); }

function tagAttrs(tag) {
  const attrs = {};
  const re = /([:@A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = re.exec(tag))) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return attrs;
}

function localUrl(value) {
  if (!value) return null;
  const clean = value.split(/[?#]/)[0];
  if (/^[a-z]+:/i.test(clean) || clean.startsWith('//')) return {external: true, clean};
  if (clean.startsWith('/')) return {external: false, id: clean.replace(/^\/+/, '')};
  return {external: false, id: joinId('index.html', `./${clean.replace(/^\.\//, '')}`)};
}

function assembleHtml(html, {css, js, mode}) {
  const styleTag = mode === 'standalone'
    ? `<style>\n${escapeStyle(css)}\n</style>`
    : '<link rel="stylesheet" href="./assets/app.css">';
  const scriptTag = mode === 'standalone'
    ? `<script>\n${escapeScript(js)}\n</script>`
    : '<script src="./assets/app.js"></script>';
  let next = html.replace(/<link\b[^>]*>/gi, tag => {
    const attrs = tagAttrs(tag);
    const rel = (attrs.rel || '').toLowerCase();
    if (rel.split(/\s+/).includes('stylesheet')) {
      const ref = localUrl(attrs.href || '');
      if (!ref) return tag;
      if (ref.external) fail(`External stylesheet is not allowed: ${attrs.href}`);
      return '';
    }
    return tag;
  });
  next = next.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrText, body) => {
    const attrs = tagAttrs(`<script${attrText}>`);
    if (!attrs.src) {
      if (/\bimport\b|\bexport\b/.test(body)) fail('Inline module scripts in index.html cannot be bundled. Use src/boot.js.');
      return full;
    }
    const ref = localUrl(attrs.src);
    if (ref?.external) fail(`External script is not allowed: ${attrs.src}`);
    return '';
  });
  if (!/<\/head>/i.test(next)) fail('index.html is missing </head>');
  if (!/<\/body>/i.test(next)) fail('index.html is missing </body>');
  const note = mode === 'standalone'
    ? '<!-- Fencefall standalone build. CSS and JS are inlined. No external runtime API. -->'
    : '<!-- Fencefall static build. Assets are local files next to this page. -->';
  next = next.replace(/<\/head>/i, `${styleTag}\n${note}\n</head>`);
  next = next.replace(/<\/body>/i, `${scriptTag}\n</body>`);
  if (mode === 'standalone') {
    if (/<script\b[^>]*\bsrc\s*=/i.test(next)) fail('Standalone HTML still references an external script');
    if (/<link\b/i.test(next)) fail('Standalone HTML still has a link tag');
    if (!next.includes('<style>') || !next.includes('<script>')) fail('Standalone HTML is missing inlined CSS or JS');
    if (/src\s*=\s*["']\.\/src\/boot\.js["']/i.test(next) || /href\s*=\s*["']\.\/src\/styles\.css["']/i.test(next)) {
      fail('Standalone HTML still points at source files');
    }
  }
  return next;
}

function diskExists(root, id) {
  const abs = path.resolve(root, id);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function diskRead(root, id) {
  const abs = path.resolve(root, id);
  const ext = path.extname(abs).toLowerCase();
  const kind = kindOf(id);
  if (kind === 'asset') return {kind, dataUri: dataUriFor(id, fs.readFileSync(abs))};
  return {kind: kind || 'js', text: fs.readFileSync(abs, 'utf8')};
}

function collectCss(html, extraIds, exists) {
  const ids = [];
  const add = id => { if (id && !ids.includes(id)) ids.push(id); };
  const linkRe = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkRe.exec(html))) {
    const attrs = tagAttrs(match[0]);
    if (!(attrs.rel || '').toLowerCase().split(/\s+/).includes('stylesheet')) continue;
    const ref = localUrl(attrs.href || '');
    if (!ref) continue;
    if (ref.external) fail(`External stylesheet is not allowed: ${attrs.href}`);
    if (!exists(ref.id)) fail(`Missing stylesheet ${attrs.href}`);
    add(ref.id);
  }
  for (const id of extraIds) add(id);
  if (!ids.includes('src/styles.css') && exists('src/styles.css')) add('src/styles.css');
  return ids;
}

function detectEntry(html, exists) {
  const re = /<script\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = tagAttrs(match[0]);
    if (!attrs.src) continue;
    const ref = localUrl(attrs.src);
    if (ref?.external) fail(`External script is not allowed: ${attrs.src}`);
    if (ref && exists(ref.id)) return ref.id;
  }
  if (exists('src/boot.js')) return 'src/boot.js';
  fail('index.html has no local script entry and src/boot.js is missing');
}

function createBundle(root, entry, html) {
  const exists = id => diskExists(root, id);
  const read = id => diskRead(root, id);
  const graph = bundleGraph(entry, read, exists);
  const cssIds = collectCss(html, graph.cssIds, exists);
  const css = escapeStyle(inlineCssFiles(cssIds, id => fs.readFileSync(path.resolve(root, id), 'utf8'), exists));
  const js = renderRuntime(graph.factories, entry, {prefix: graph.prefix});
  return {js, css, graph, cssIds, entry};
}

function runCapture(js) {
  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    Promise,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Intl,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    NaN,
    Infinity,
    undefined,
    crypto: globalThis.crypto,
    performance: {now() { return 0; }},
    document: {baseURI: 'https://fencefall.local/index.html', hidden: false}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, {timeout: 3000});
  return sandbox.__ff_capture;
}

function assert(cond, message) {
  if (!cond) fail(message || 'assertion failed');
}

function bundleVirtual(files, entry, options = {}) {
  const exists = id => Object.prototype.hasOwnProperty.call(files, id);
  const read = id => {
    if (!exists(id)) fail(`virtual module missing ${id}`);
    const value = files[id];
    if (typeof value === 'string') {
      const kind = kindOf(id) || 'js';
      if (kind === 'asset') return {kind, dataUri: value};
      return {kind, text: value};
    }
    return value;
  };
  const graph = bundleGraph(entry, read, exists);
  const js = renderRuntime(graph.factories, entry, {capture: true, prefix: graph.prefix});
  return {js, graph, ns: options.nocapture ? null : runCapture(js)};
}

function selfTest() {
  const basic = bundleVirtual({
    'src/shared.js': `export const STEP = 1/60;\nexport function clamp(n,a,b){return Math.max(a,Math.min(b,n));}\nexport let ticks = 0;\nexport function bump(){ticks++;}\n`,
    'src/state.js': `import {STEP, clamp} from './shared.js';\nexport function createRun(){return {step:STEP, n:clamp(5,0,3)};}\nexport const label = "export const fake = 1; import x from './nope.js';";\n`,
    'src/engine.js': `import {STEP, clamp, bump, ticks} from './shared.js';\nexport {createRun} from './state.js';\nexport function step(dt=STEP){bump(); return clamp(dt,0,1)+ticks;}\nexport class Box { constructor(v){ this.v=v; } }\nexport const {renamed: two, three} = {renamed:2, three:3};\n`,
    'src/boot.js': `import defHold, {createRun, step, Box, two, three} from './engine.js';\nimport * as engine from './engine.js';\nconst re = /a{1,2}/g;\nconst text = \`import \${1} export\`;\n// import { nope } from './missing.js'\n/* export function hidden(){ return import('./nope.js'); } */\nconst phrase = "import.meta";\nexport default function main(){ return phrase; }\nexport const out = {run:createRun(), stepped:step(2), box:new Box(two+three).v, star:engine, re:re.test('aa'), text, phrase, def: main()};\n`
  }, 'src/boot.js');
  assert(basic.ns.out.run.n === 3, 'clamp binding');
  assert(Math.abs(basic.ns.out.run.step - 1 / 60) < 1e-12, 're-exported STEP');
  assert(basic.ns.out.stepped === 1, 'default arg, live let through a function, clamp');
  assert(basic.ns.out.box === 5, 'class and destructured export');
  assert(basic.ns.out.star.two === 2 && typeof basic.ns.out.star.step === 'function', 'namespace import');
  assert(basic.ns.out.re === true && basic.ns.out.text.includes('import'), 'regex and template');
  assert(basic.ns.out.phrase === 'import.meta' && basic.ns.out.def === 'import.meta', 'strings and default export kept');
  assert(basic.graph.warnings.length === 0, 'acyclic sample warned');

  const cycle = bundleVirtual({
    'p.js': `import {fromP} from './q.js';\nexport function ping(){return 'p'+fromP();}\nexport function mark(){return 'P';}\n`,
    'q.js': `import {mark} from './p.js';\nexport function fromP(){return mark();}\n`
  }, 'p.js');
  assert(cycle.ns.ping() === 'pP', 'cyclic function declarations');
  assert(cycle.graph.warnings.some(w => w.includes('cycle')), 'cycle warning');

  const dyn = bundleVirtual({
    'dep.js': 'export const value = 7;\n',
    'main.js': 'export function load(){return import("./dep.js").then(m => m.value);}\n'
  }, 'main.js');
  return dyn.ns.load().then(value => {
    assert(value === 7, 'static dynamic import');
    assert(dyn.js.includes('__ff_dyn("dep.js")'), 'dynamic import rewritten');
  });
}

function verifyEngineBundle(root) {
  const exists = id => diskExists(root, id);
  const graph = bundleGraph('src/engine.js', id => diskRead(root, id), exists);
  const js = renderRuntime(graph.factories, 'src/engine.js', {capture: true, prefix: graph.prefix});
  const ns = runCapture(js);
  const run = ns.createRun({seed: 1, runId: 'build-check'});
  assert(run.slots.length === 10, 'bundled createRun slot count');
  assert(run.slots.filter(slot => slot.unit).length === 1, 'bundled roster');
  assert(run.slots[7].unit.kind === 'hero', 'bundled hero slot');
  assert(run.fence.maxHp === 600, 'bundled normal fence');
  const tick = run.tick;
  ns.advance(run, 1 / 60);
  assert(run.tick === tick + 1, 'bundled advance');
  run.paused = true;
  ns.advance(run, 1);
  assert(run.tick === tick + 1, 'bundled pause');
  ns.setSpeed(run, 3);
  assert(run.speed === 3, 'bundled speed');
  ns.setSpeed(run, 2);
  assert(run.speed === 3, 'bundled rejected speed');
}

function writeBuild(root, outDir) {
  const htmlPath = path.join(root, 'index.html');
  if (!fs.existsSync(htmlPath)) fail('index.html is missing');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const exists = id => diskExists(root, id);
  const entry = detectEntry(html, exists);
  if (entry !== 'src/boot.js') console.warn(`Build entry is ${entry}; the contract entry is src/boot.js.`);
  const built = createBundle(root, entry, html);
  if (!built.css.includes('color-scheme') && fs.existsSync(path.join(root, 'src/styles.css'))) {
    const raw = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
    if (raw.includes('color-scheme') && !built.css.includes('color-scheme')) fail('src/styles.css was not inlined');
  }
  const standalone = assembleHtml(html, {css: built.css, js: built.js, mode: 'standalone'});
  const staticHtml = assembleHtml(html, {css: built.css, js: built.js, mode: 'static'});
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(path.join(outDir, 'static', 'assets'), {recursive: true});
  fs.writeFileSync(path.join(outDir, 'index.html'), standalone);
  fs.writeFileSync(path.join(outDir, 'static', 'index.html'), staticHtml);
  fs.writeFileSync(path.join(outDir, 'static', 'assets', 'app.js'), built.js);
  fs.writeFileSync(path.join(outDir, 'static', 'assets', 'app.css'), built.css);
  const report = {
    entry,
    modules: Object.keys(built.graph.factories).sort(),
    cssFiles: built.cssIds,
    warnings: built.graph.warnings,
    devDependencies: [],
    externalRuntimeRequests: false,
    outputs: {
      standalone: 'dist/index.html',
      staticIndex: 'dist/static/index.html',
      script: 'dist/static/assets/app.js',
      css: 'dist/static/assets/app.css'
    },
    bytes: {
      standalone: Buffer.byteLength(standalone),
      script: Buffer.byteLength(built.js),
      css: Buffer.byteLength(built.css)
    }
  };
  fs.writeFileSync(path.join(outDir, 'build.json'), `${JSON.stringify(report, null, 2)}\n`);
  const checked = spawnSync(process.execPath, ['--check', path.join(outDir, 'static', 'assets', 'app.js')], {encoding: 'utf8'});
  if (checked.status !== 0) fail(`node --check failed for dist/static/assets/app.js\n${checked.stderr || checked.stdout}`);
  console.log(`Fencefall build`);
  console.log(`  entry: ${entry}`);
  console.log(`  modules: ${report.modules.length} (${report.modules.join(', ')})`);
  console.log(`  css: ${report.cssFiles.join(', ') || '(none)'} (${report.bytes.css} bytes)`);
  console.log(`  standalone: dist/index.html (${report.bytes.standalone} bytes)`);
  console.log(`  static: dist/static/index.html`);
  if (report.warnings.length) console.warn(report.warnings.map(w => `  warning: ${w}`).join('\n'));
  else console.log('  warnings: none');
  console.log('  devDependencies: none');
  return report;
}

function execEntry(root) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const built = createBundle(root, detectEntry(html, id => diskExists(root, id)), html);
  const calls = [];
  function box() {
    const target = function() { return box(); };
    return new Proxy(target, {
      get(obj, prop) {
        if (prop === Symbol.toPrimitive) return () => 0;
        if (prop === 'then') return undefined;
        if (prop === 'hidden') return false;
        if (typeof prop === 'symbol') return undefined;
        if (prop in obj && prop !== 'prototype') return obj[prop];
        const child = box();
        obj[prop] = child;
        return child;
      },
      set(obj, prop, value) { obj[prop] = value; calls.push(String(prop)); return true; }
    });
  }
  const sandbox = {console, document: box(), performance: {now() { return 0; }}, requestAnimationFrame() { return 1; }};
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(built.js, sandbox, {timeout: 3000});
  if (!calls.includes('innerHTML')) fail('--exec did not reach the scaffold boot document write');
  console.log('  exec: scaffold bundle ran under a DOM stand-in (not a browser)');
}

async function main(argv) {
  await selfTest();
  verifyEngineBundle(ROOT);
  if (argv.includes('--self-test-only')) {
    console.log('Fencefall bundler self-test passed');
    return;
  }
  const outFlag = argv.indexOf('--out');
  const outDir = outFlag >= 0 ? path.resolve(argv[outFlag + 1] || '') : path.join(ROOT, 'dist');
  if (!outDir || outDir === path.parse(outDir).root) fail('missing --out directory');
  writeBuild(ROOT, outDir);
  if (argv.includes('--exec')) execEntry(ROOT);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
