/**
 * A small Delphi source tokenizer and the mechanical transformations needed to compile the original
 * Lemmix units with Free Pascal 3.2.2:
 *
 *  1. unit names in uses clauses are mapped (System.Classes -> Classes, Vcl.Forms -> stub unit, ...)
 *  2. inline variable declarations (Delphi 10.3+), which FPC does not support, are hoisted into a var
 *     section directly before the routine body:
 *        var x: T := e;    ->  x := e;          (+ "x: T" in the routine's var section)
 *        var x := e;       ->  x := e;          (type inferred from "T.Create" or from a hint)
 *        var x, y: T;      ->  (removed)        (+ "x, y: T")
 *        for var i := ...  ->  for i := ...     (+ "i: Integer", or the declared type)
 *        for var x: T in   ->  for x in         (+ "x: T")
 *
 * The transformations are purely syntactic; they do not change behaviour (initializers stay where they
 * were). Name clashes and "shadowing" hazards are detected and reported as errors.
 */

export type TokKind = 'ws' | 'comment' | 'directive' | 'string' | 'number' | 'ident' | 'sym';

export interface Token {
  kind: TokKind;
  text: string;
  pos: number;
  line: number;
}

const SYMS2 = [':=', '<=', '>=', '<>', '..', '(.', '.)'];

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  const push = (kind: TokKind, start: number, end: number) => {
    const text = src.slice(start, end);
    toks.push({ kind, text, pos: start, line });
    for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) line++;
  };
  while (i < src.length) {
    const c = src[i];
    const start = i;
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      while (i < src.length && /[ \t\r\n]/.test(src[i])) i++;
      push('ws', start, i);
    } else if (c === '{') {
      const end = src.indexOf('}', i + 1);
      i = end < 0 ? src.length : end + 1;
      push(src[start + 1] === '$' ? 'directive' : 'comment', start, i);
    } else if (c === '(' && src[i + 1] === '*') {
      const end = src.indexOf('*)', i + 2);
      i = end < 0 ? src.length : end + 2;
      push(src[start + 2] === '$' ? 'directive' : 'comment', start, i);
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
      push('comment', start, i);
    } else if (c === "'" || c === '#') {
      // string expression: sequences of 'quoted' and #nn parts
      while (i < src.length && (src[i] === "'" || src[i] === '#')) {
        if (src[i] === "'") {
          i++;
          for (;;) {
            if (i >= src.length) break;
            if (src[i] === "'") {
              if (src[i + 1] === "'") {
                i += 2;
                continue;
              }
              i++;
              break;
            }
            i++;
          }
        } else {
          i++;
          if (src[i] === '$') {
            i++;
            while (i < src.length && /[0-9A-Fa-f]/.test(src[i])) i++;
          } else while (i < src.length && /[0-9]/.test(src[i])) i++;
        }
      }
      push('string', start, i);
    } else if (/[0-9]/.test(c) || (c === '$' && /[0-9A-Fa-f]/.test(src[i + 1] ?? ''))) {
      if (c === '$') {
        i++;
        while (i < src.length && /[0-9A-Fa-f]/.test(src[i])) i++;
      } else {
        while (i < src.length && /[0-9]/.test(src[i])) i++;
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) {
          i++;
          while (i < src.length && /[0-9]/.test(src[i])) i++;
        }
        if (/[eE]/.test(src[i] ?? '') && /[-+0-9]/.test(src[i + 1] ?? '')) {
          i += 2;
          while (i < src.length && /[0-9]/.test(src[i])) i++;
        }
      }
      push('number', start, i);
    } else if (/[A-Za-z_&]/.test(c)) {
      i++;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
      push('ident', start, i);
    } else {
      const two = src.slice(i, i + 2);
      if (SYMS2.includes(two)) i += 2;
      else i++;
      push('sym', start, i);
    }
  }
  return toks;
}

export const lc = (t: Token | undefined) => (t ? t.text.toLowerCase() : '');

/** Indices of significant tokens (no whitespace or comments; directives are kept out as well). */
export function significant(toks: Token[]): number[] {
  const r: number[] = [];
  toks.forEach((t, i) => {
    if (t.kind !== 'ws' && t.kind !== 'comment' && t.kind !== 'directive') r.push(i);
  });
  return r;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

export function applyEdits(src: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = src;
  let lastStart = Infinity;
  for (const e of sorted) {
    if (e.end > lastStart) throw new Error(`overlapping edits at ${e.start}`);
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  return out;
}

/* ---------------------------------------------------------------------------------------------- uses clauses */

export function rewriteUses(src: string, map: Record<string, string | null>, file: string): string {
  const toks = tokenize(src);
  const sig = significant(toks);
  const edits: Edit[] = [];
  for (let k = 0; k < sig.length; k++) {
    if (lc(toks[sig[k]]) !== 'uses') continue;
    // collect unit names up to ';'
    let j = k + 1;
    const names: { start: number; end: number; name: string }[] = [];
    while (j < sig.length && toks[sig[j]].text !== ';') {
      const t = toks[sig[j]];
      if (t.kind === 'ident') {
        let name = t.text;
        const start = t.pos;
        let end = t.pos + t.text.length;
        while (toks[sig[j + 1]]?.text === '.' && toks[sig[j + 2]]?.kind === 'ident') {
          name += '.' + toks[sig[j + 2]].text;
          end = toks[sig[j + 2]].pos + toks[sig[j + 2]].text.length;
          j += 2;
        }
        names.push({ start, end, name });
      }
      j++;
    }
    const endSemi = toks[sig[j]];
    // rebuild the clause
    const kept: string[] = [];
    for (const n of names) {
      const key = Object.keys(map).find((m) => m.toLowerCase() === n.name.toLowerCase());
      if (key === undefined) kept.push(n.name);
      else if (map[key] !== null) kept.push(map[key]!);
    }
    const dedup = kept.filter((n, i) => kept.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
    const first = toks[sig[k]];
    edits.push({
      start: first.pos,
      end: endSemi.pos + 1,
      text: dedup.length ? 'uses\n  ' + dedup.join(', ') + ';' : '',
    });
    k = j;
  }
  void file;
  return applyEdits(src, edits);
}

/* ---------------------------------------------------------------------------------------------- inline vars */

export interface HoistReport {
  file: string;
  routineLine: number;
  hoisted: { name: string; type: string; line: number }[];
}

export interface HoistOptions {
  file: string;
  /** Types for "var x := expr" declarations that cannot be inferred, keyed by "<identifier>@<line>". */
  typeHints?: Record<string, string>;
}

const BLOCK_OPENERS = new Set(['begin', 'try', 'asm']);

export function hoistInlineVars(src: string, opts: HoistOptions): { src: string; reports: HoistReport[] } {
  const toks = tokenize(src);
  const sig = significant(toks);
  const edits: Edit[] = [];
  const reports: HoistReport[] = [];

  let inImplementation = false;
  const stack: string[] = [];
  // current routine body: index into sig of its "begin" token
  let bodyStart = -1;
  let hoisted: { name: string; type: string; line: number }[] = [];
  let bodyIdents = new Map<string, number>(); // first sig index where an identifier was used in this body

  const typeTokensText = (from: number, stopAt: Set<string>): { text: string; next: number } => {
    let depth = 0;
    let j = from;
    const parts: string[] = [];
    while (j < sig.length) {
      const t = toks[sig[j]];
      const l = lc(t);
      if (depth === 0 && stopAt.has(l)) break;
      if (t.text === '<' || t.text === '(' || t.text === '[') depth++;
      if (t.text === '>' || t.text === ')' || t.text === ']') depth--;
      parts.push(t.text);
      j++;
    }
    return { text: parts.join('').replace(/,/g, ', '), next: j };
  };

  const finishBody = () => {
    if (bodyStart >= 0 && hoisted.length > 0) {
      const begin = toks[sig[bodyStart]];
      // group by type, keep declaration order
      const decls: string[] = [];
      const seen = new Map<string, string>();
      for (const h of hoisted) {
        const key = h.name.toLowerCase();
        const prev = seen.get(key);
        if (prev !== undefined) {
          if (prev.toLowerCase() !== h.type.toLowerCase())
            throw new Error(`${opts.file}:${h.line}: inline var '${h.name}' declared twice with different types (${prev} / ${h.type})`);
          continue;
        }
        seen.set(key, h.type);
        decls.push(`  ${h.name}: ${h.type};`);
      }
      edits.push({ start: begin.pos, end: begin.pos, text: `var {hoisted inline vars}\n${decls.join('\n')}\n` });
      reports.push({ file: opts.file, routineLine: begin.line, hoisted: [...hoisted] });
    }
    bodyStart = -1;
    hoisted = [];
    bodyIdents = new Map();
  };

  for (let k = 0; k < sig.length; k++) {
    const t = toks[sig[k]];
    const l = lc(t);
    if (!inImplementation) {
      if (l === 'implementation') inImplementation = true;
      continue;
    }
    if (l === 'initialization' || l === 'finalization') {
      finishBody();
      continue;
    }

    const inBody = stack.includes('begin') || stack.includes('try');

    if (BLOCK_OPENERS.has(l)) {
      if (stack.length === 0 && l === 'begin') {
        finishBody();
        bodyStart = k;
      }
      stack.push(l);
      continue;
    }
    if (l === 'case') {
      if (stack[stack.length - 1] !== 'record') stack.push('case');
      continue;
    }
    if (l === 'record') {
      stack.push('record');
      continue;
    }
    if (l === 'class' && !inBody) {
      // class type definitions: "= class(" or "= class" followed by members ... end
      const prev = lc(toks[sig[k - 1]]);
      const next = lc(toks[sig[k + 1]]);
      if (prev === '=' && next !== ';' && next !== 'of') {
        // forward declaration "TFoo = class;" has no end
        if (next === '(') {
          // could still be "class(TParent);" (no body)
          let j = k + 1;
          while (j < sig.length && toks[sig[j]].text !== ')') j++;
          if (toks[sig[j + 1]]?.text === ';') continue;
        }
        stack.push('class');
      }
      continue;
    }
    if (l === 'end') {
      stack.pop();
      continue;
    }

    // remember the first use of every plain identifier in the body (not "x.ident" member access)
    if (inBody && t.kind === 'ident' && l !== 'var' && toks[sig[k - 1]]?.text !== '.' && !bodyIdents.has(l)) bodyIdents.set(l, k);

    if (l === 'var' && inBody) {
      const isFor = lc(toks[sig[k - 1]]) === 'for';
      // names
      let j = k + 1;
      const names: Token[] = [];
      for (;;) {
        const n = toks[sig[j]];
        if (n.kind !== 'ident') throw new Error(`${opts.file}:${n.line}: unexpected token after inline var: ${n.text}`);
        names.push(n);
        j++;
        if (toks[sig[j]].text === ',') {
          j++;
          continue;
        }
        break;
      }
      let type: string | null = null;
      let afterType = j;
      if (toks[sig[j]].text === ':') {
        const r = typeTokensText(j + 1, new Set([':=', ';', 'in', '=']));
        type = r.text;
        afterType = r.next;
      }
      const terminator = toks[sig[afterType]];
      const tl = lc(terminator);

      for (const n of names) {
        // shadowing hazard: the name was already used in this body before its declaration
        const firstUse = bodyIdents.get(n.text.toLowerCase());
        if (firstUse !== undefined && firstUse < k && !hoisted.some((h) => h.name.toLowerCase() === n.text.toLowerCase()))
          throw new Error(
            `${opts.file}:${n.line}: inline var '${n.text}' is used earlier in the routine (line ${toks[sig[firstUse]].line}); hoisting could change its meaning`,
          );
      }

      let resolvedType = type;
      if (!resolvedType) {
        if (isFor && tl === ':=') resolvedType = 'Integer';
        else {
          const hintKey = `${names[0].text}@${names[0].line}`;
          const hint = opts.typeHints?.[hintKey];
          if (hint) resolvedType = hint;
          else if (tl === ':=') {
            // infer "T.Create" or "T<...>.Create"
            const r = typeTokensText(afterType + 1, new Set(['.']));
            const after = toks[sig[r.next + 1]];
            if (lc(after) === 'create' && /^[A-Za-z_][A-Za-z0-9_<>, ]*$/.test(r.text)) resolvedType = r.text;
          }
        }
      }
      if (!resolvedType) throw new Error(`${opts.file}:${names[0].line}: cannot infer type of inline var '${names[0].text}' (add a type hint)`);

      for (const n of names) hoisted.push({ name: n.text, type: resolvedType, line: n.line });

      if (tl === ';' && !isFor) {
        // "var x, y: T;" -> remove the whole declaration statement
        edits.push({ start: t.pos, end: terminator.pos + 1, text: '' });
      } else {
        // remove "var" and ": Type" (keep names and the := / in that follows)
        const lastName = names[names.length - 1];
        edits.push({ start: t.pos, end: names[0].pos, text: '' });
        if (type !== null) edits.push({ start: lastName.pos + lastName.text.length, end: terminator.pos, text: ' ' });
      }
      k = afterType - 1;
      continue;
    }
  }
  finishBody();
  return { src: applyEdits(src, edits), reports };
}

/* ---------------------------------------------------------------------------------------------- patches */

export interface Patch {
  file: string;
  /** Exact text to find (must occur exactly `count` times, default 1). */
  find: string;
  replace: string;
  reason: string;
  count?: number;
}

export function applyPatches(file: string, src: string, patches: Patch[]): string {
  for (const p of patches.filter((x) => x.file === file)) {
    const occurrences = src.split(p.find).length - 1;
    const expected = p.count ?? 1;
    if (occurrences !== expected)
      throw new Error(`patch for ${file} (${p.reason}) expected ${expected} occurrence(s), found ${occurrences}:\n${p.find}`);
    src = src.split(p.find).join(p.replace);
  }
  return src;
}
