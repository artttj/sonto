// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|try|catch|throw|switch|case|break|continue|default|typeof|instanceof|void|null|undefined|true|false|interface|type|enum|extends|implements|public|private|protected|static|readonly|abstract|def|self|lambda|yield|in|not|and|or|print)\b/g;

const NUMBERS = /\b(\d+\.?\d*)\b/g;

const STRINGS = /(["'`])(?:(?!\1|\\).|\\.)*?\1/g;

const COMMENTS = /(\/\/.*$|#.*$)/gm;

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightCode(raw: string): string {
  const escaped = esc(raw);

  const placeholders: string[] = [];
  const ph = (cls: string, match: string) => {
    const idx = placeholders.length;
    placeholders.push(`<span class="${cls}">${match}</span>`);
    return `\x00${idx}\x00`;
  };

  let result = escaped
    .replace(STRINGS, (m) => ph('sh-string', m))
    .replace(COMMENTS, (m) => ph('sh-comment', m));

  result = result
    .replace(KEYWORDS, (m) => ph('sh-keyword', m))
    .replace(NUMBERS, (m) => ph('sh-number', m));

  return result.replace(/\x00(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]);
}
