// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const compiler = process.env.I18N_COMPILER;
if (!compiler) throw new Error("Set I18N_COMPILER to the pinned i18n-catalog binary; see i18n/README.md");
execFileSync(compiler, ["targets", path.join(root,"i18n/catalog"), "--channel", "production", "--target", "classic", "--target", "webextension", "--out", path.join(root,"i18n/generated")], {stdio:"inherit"});
const runtime = path.join(root,"extension/i18n");
fs.mkdirSync(runtime,{recursive:true});
fs.copyFileSync(path.join(root,"i18n/generated/classic/browser/api.js"),path.join(runtime,"catalog.js"));
fs.copyFileSync(path.join(root,"i18n/generated/classic/browser/LICENSE.fluent"),path.join(runtime,"LICENSE.fluent"));
fs.rmSync(path.join(root,"extension/_locales"),{recursive:true,force:true});
fs.cpSync(path.join(root,"i18n/generated/webextension/browser/_locales"),path.join(root,"extension/_locales"),{recursive:true});
const contracts = {};
for (const file of fs.readdirSync(path.join(root,"i18n/catalog/meta")).sort()) {
  const meta=JSON.parse(fs.readFileSync(path.join(root,"i18n/catalog/meta",file),"utf8"));
  contracts[file.slice(0,-5)]={arguments:meta.arguments,selector:meta.selector || null};
}
fs.writeFileSync(path.join(runtime,"contracts.js"),'// SPDX-License-Identifier: AGPL-3.0-only\n// Copyright (c) 2026 sol pbc\n// Generated from catalog sidecars.\nglobalThis.SolstoneI18nContracts = '+JSON.stringify(contracts,null,2)+';\n');
function files(dir) {
 return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,"en")).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
}
const manifest={};
for(const dir of ['i18n/catalog','i18n/generated','extension/i18n','extension/_locales']) for(const file of files(path.join(root,dir))) {
 const relative=path.relative(root,file);
 if(relative==='i18n/generated/snapshot.json'||relative==='extension/i18n/index.js')continue;
 manifest[relative]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
fs.writeFileSync(path.join(root,'i18n/generated/snapshot.json'),JSON.stringify(manifest,null,2)+'\n');
