// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
await import('../extension/i18n/catalog.js');
await import('../extension/i18n/contracts.js');
await import('../extension/i18n/index.js');

// Resolve the actual catalog in markup fixtures so existing English assertions
// continue testing the text that a loaded page shows.
export function localizeHtmlFixture(html) {
  return html.replace(/(<[\w]+)([^<>]*\bdata-i18n="([^"]+)"[^<>]*)>([\s\S]*?)(<\/[\w]+>)/g,(_all,tag,attributes,id,content,close)=>{
    const encoded=attributes.match(/data-i18n-args='([^']+)'/);
    const args=encoded?JSON.parse(encoded[1]):{};
    const clean=attributes.replace(/\s+data-i18n="[^"]+"/g,'').replace(/\s+data-i18n-args='[^']+'/g,'');
    return tag+clean+'>'+globalThis.SolstoneI18n.t(id,args)+close;
  }).replace(/placeholder="" data-i18n-placeholder="([^"]+)"/g,(_all,id)=>'placeholder="'+globalThis.SolstoneI18n.t(id)+'"');
}
