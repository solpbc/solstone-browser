// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const api=globalThis.SolstoneI18nBundles.browser;
const cases=JSON.parse(read('i18n/generated/cases.json')).cases;
test('source identities, generated runtime, manifest resources and adapter contracts agree',()=>{
 const sourceIds=[...read('i18n/catalog/source/en-US.ftl').matchAll(/^(browser\.[\w.]+) =/gm)].map(m=>m[1]).sort();
 assert.ok(sourceIds.length>0);
 assert.deepEqual([...api.messageIds].sort(),sourceIds);
 assert.deepEqual([...globalThis.SolstoneI18n.ids].sort(),sourceIds);
 assert.deepEqual([...new Set(cases.map(c=>c.message_id))].sort(),sourceIds);
 const snapshot=JSON.parse(read('i18n/generated/snapshot.json'));
 for(const [name,hash] of Object.entries(snapshot))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),hash,name+' needs regeneration');
 const manifest=JSON.parse(read('extension/manifest.json'));
 const messages=JSON.parse(read(`extension/_locales/${manifest.default_locale}/messages.json`));
 for(const field of [manifest.name,manifest.description,manifest.action.default_title])assert.ok(messages[field.slice(6,-2)],field);
});
test('classic script renders every emitted contract without a module loader',()=>{
 const context=vm.createContext({Intl});
 vm.runInContext(read('extension/i18n/catalog.js'),context);
 const classic=context.SolstoneI18nBundles.browser;
 const eligible=cases.filter(c=>c.target==='classic');assert.ok(eligible.length>0);
 for(const c of eligible)assert.equal(classic.render(c.locale,c.message_id,Object.entries(c.inputs),{useIsolating:false}),c.logical_expected.replace(/[\u2068\u2069]/g,''),c.message_id);
});
test('English parity is explicit and does not strip isolation from future callers',()=>{
 const id='browser.failure.raw',args=[['raw','العربية <test>']];
 assert.equal(api.render('en-US',id,args,{useIsolating:false}),'something went wrong: العربية <test>');
 assert.equal(api.render('en-US',id,args),'something went wrong: \u2068العربية <test>\u2069');
 assert.throws(()=>api.render('en-US',id,args,{useIsolating:'false'}));
 assert.throws(()=>api.render('en-US',id,[]));
});
