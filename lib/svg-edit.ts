// Targeted SVG editing: apply small operations to elements identified by
// stable ids without regenerating the whole document.

export type SvgOp = {
  id: string;
  attr?: string;
  value?: string;
  text?: string;
  remove?: boolean;
};

type ElementLocation = {
  start: number;
  end: number;
  tag: string;
  openTagEnd: number;
  selfClosing: boolean;
};

export function findElementById(svg: string, id: string): ElementLocation | null {
  const openRe = new RegExp(`<([a-zA-Z][\\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?\\bid\\s*=\\s*"${escapeRegExp(id)}"(?:[^>"']|"[^"]*"|'[^']*')*?)(/?)>`);
  const m = openRe.exec(svg);
  if (!m || m.index === undefined) return null;
  const tag = m[1];
  const start = m.index;
  const openTagEnd = start + m[0].length;
  if (m[3] === "/") {
    return { start, end: openTagEnd, tag, openTagEnd, selfClosing: true };
  }
  // Balanced scan for the matching closing tag.
  const tokenRe = new RegExp(`<${tag}(?=[\\s>/])|</${tag}\\s*>`, "g");
  tokenRe.lastIndex = openTagEnd;
  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(svg))) {
    if (token[0].startsWith("</")) {
      depth--;
      if (depth === 0) {
        return { start, end: token.index + token[0].length, tag, openTagEnd, selfClosing: false };
      }
    } else {
      // Skip self-closing same-tag elements.
      const closeAngle = svg.indexOf(">", token.index);
      if (closeAngle === -1) return null;
      if (svg[closeAngle - 1] !== "/") depth++;
      tokenRe.lastIndex = closeAngle + 1;
    }
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setAttribute(svg: string, loc: ElementLocation, attr: string, value: string): string {
  const openTag = svg.slice(loc.start, loc.openTagEnd);
  const attrRe = new RegExp(`\\b${escapeRegExp(attr)}\\s*=\\s*"[^"]*"`);
  let newOpenTag: string;
  if (attrRe.test(openTag)) {
    newOpenTag = openTag.replace(attrRe, `${attr}="${escapeXml(value)}"`);
  } else {
    newOpenTag = openTag.replace(/(\/?)>$/, ` ${attr}="${escapeXml(value)}"$1>`);
  }
  return svg.slice(0, loc.start) + newOpenTag + svg.slice(loc.openTagEnd);
}

function setText(svg: string, loc: ElementLocation, text: string): string | null {
  if (loc.selfClosing) return null;
  if (loc.tag !== "text" && loc.tag !== "tspan" && loc.tag !== "title") return null;
  const openTag = svg.slice(loc.start, loc.openTagEnd);
  const closing = `</${loc.tag}>`;
  return svg.slice(0, loc.start) + openTag + escapeXml(text) + closing + svg.slice(loc.end);
}

export function applySvgOps(svg: string, ops: SvgOp[]): string | null {
  let result = svg;
  for (const op of ops) {
    const loc = findElementById(result, op.id);
    if (!loc) return null;
    if (op.remove) {
      result = result.slice(0, loc.start) + result.slice(loc.end);
    } else if (op.attr !== undefined && op.value !== undefined) {
      result = setAttribute(result, loc, op.attr, op.value);
    } else if (op.text !== undefined) {
      const updated = setText(result, loc, op.text);
      if (updated === null) return null;
      result = updated;
    } else {
      return null;
    }
  }
  return result;
}

export function listElementIds(svg: string): string[] {
  return [...svg.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
}
