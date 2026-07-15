const EVENT_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_TAG = /<script[\s\S]*?(?:<\/script>|$)/gi;
const FOREIGN_OBJECT = /<foreignObject[\s\S]*?(?:<\/foreignObject>|$)/gi;
const JS_HREF = /\s(?:xlink:)?href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi;
const EXTERNAL_HREF = /\s(?:xlink:)?href\s*=\s*(?:"(?:https?:)?\/\/[^"]*"|'(?:https?:)?\/\/[^']*')/gi;

export function sanitizeSvg(svg: string): string {
  return svg
    .replace(SCRIPT_TAG, "")
    .replace(FOREIGN_OBJECT, "")
    .replace(EVENT_ATTR, "")
    .replace(JS_HREF, "")
    .replace(EXTERNAL_HREF, "");
}
