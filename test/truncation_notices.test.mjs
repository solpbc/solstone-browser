// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
for (const name of ["native-browser/constants.js", "native-browser/schemas.js", "native-browser/schema-validator.js", "native-browser/codec.js", "lib/uuid.js", "lib/db.js", "lib/blocks.js", "lib/hosts.js", "lib/segment.js", "lib/gate.js", "lib/native_outbox.js", "lib/native_port.js", "lib/owner_sites.js", "lib/router.js", "skim.js"]) await import(new URL("../extension/" + name, import.meta.url));
const D=SolstoneDB,R=SolstoneRouter,O=SolstoneNativeOutbox,origin="https://example.test";
const el=(text,children=[])=>({nodeType:1,tagName:"DIV",checkVisibility:()=>true,matches:()=>false,getAttribute:()=>null,childNodes:text?[{nodeType:3,nodeValue:text}]:[],children});
async function fixture() {
 for(const store of ["meta","producer","outbox"]) await D.clear(store);
 R.frameBindings.clear(); R.frameChallenges.clear();
 const p=new SolstoneNativePort({inst:"00000000-0000-0000-0000-000000000001",runtimeId:"ext",now:()=>9000});
 p.grantedOrigins.add(origin);p.chosenOrigins.add(origin);p.hostCapture="permitted";p.capturePermitted=true;p.consentVersion=1;p.lease={token:"tok",generation:"gen",freshnessMs:10000,receivedAt:0};p.connectionGeneration=1;p.destinationGeneration="gen";
 async function send(doc,root,expected=true) {
  const sender={id:"ext",tab:{id:doc},frameId:0,documentId:"doc-"+doc,url:origin+"/page",origin};
  const deps={runtimeId:"ext",port:p,confirmRealm:async()=>true};
  const h=await R.route({kind:"hello",realmToken:"realm-"+doc},sender,deps);
  const result=await R.route({kind:"skim",realmToken:"realm-"+doc,captureEpoch:h.captureEpoch,connectionGeneration:1,destinationGeneration:"gen",leaseToken:"tok",...SolstoneSkim.skim(root,{skip:null,boundary:null})},sender,deps);
  assert.equal(result.ok,expected,JSON.stringify(result));return result;
 }
 return {p,send};
}
test("real skims fold more than sixteen documents and keep dismissal across restart",async()=>{
 const {p,send}=await fixture();const page=()=>el("x".repeat(2001));
 for(let doc=1;doc<=49;doc++) await send(doc,page());
 assert.equal(p.truncationByOrigin[origin].count,49);
 const through=p.truncationByOrigin[origin].newestId;
 await p.dismissTruncation(origin,through);assert.equal(p.truncationByOrigin[origin].count,0);
 for(const row of await D.getAll("outbox"))await O.removeBatch(row.batchId);
 R.frameBindings.clear();p.truncationByOrigin=await D.get("meta","truncationByOrigin");
 await send(1,page());await send(49,page());assert.equal(p.truncationByOrigin[origin].count,0);
 await send(1,el("y".repeat(2001)));assert.equal(p.truncationByOrigin[origin].count,1);
 await p.dismissTruncation(origin,through);assert.equal(p.truncationByOrigin[origin].count,1);
});
test("real omitted transition and return to an earlier representation notify again",async()=>{
 const {p,send}=await fixture();const children=Array.from({length:1500},(_,i)=>el("text "+i));
 const full=()=>el("",children),clipped=()=>el("",[...children,el("extra")]);
 await send(1,full());const first=await send(1,clipped());assert.equal(first.result.disposition,"empty");
 await p.dismissTruncation(origin,p.truncationByOrigin[origin].newestId);
 await send(1,clipped());assert.equal(p.truncationByOrigin[origin].count,0);
 await send(1,full());await send(1,clipped());assert.equal(p.truncationByOrigin[origin].count,1);
 await p.dismissTruncation(origin,p.truncationByOrigin[origin].newestId);
 await send(1,el("changed".repeat(400)));await send(1,clipped());
 assert.equal(p.truncationByOrigin[origin].count,2);
 assert.equal(Object.keys(p.truncationByOrigin[origin].documents).length,1);
});
test("notice persistence failure aborts the real batch and cursor too",async()=>{
 const {p,send}=await fixture();const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,key){if(this.name==="meta"&&key==="truncationByOrigin")throw new Error("fixture notice failure");return put.call(this,value,key);};
 try {await send(1,el("x".repeat(2001)),false);}finally{IDBObjectStore.prototype.put=put;}
 assert.equal((await D.getAll("outbox")).length,0);assert.equal((await D.getAll("producer")).length,0);
 assert.equal(p.truncationByOrigin[origin],undefined);assert(p.enqueue[origin]);
 await send(1,el("x".repeat(2001)));assert.equal(p.truncationByOrigin[origin].count,1);assert.equal(p.enqueue[origin],undefined);
});
test("empty enqueue cannot lose an omission when its notice write fails",async()=>{
 const {p,send}=await fixture();const children=Array.from({length:1500},(_,i)=>el("text "+i));
 await send(1,el("",children));const rows=await D.getAll("outbox");
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,key){if(this.name==="meta"&&key==="truncationByOrigin")throw new Error("fixture notice failure");return put.call(this,value,key);};
 try{await send(1,el("",[...children,el("extra")]),false);}finally{IDBObjectStore.prototype.put=put;}
 assert.equal(p.truncationByOrigin[origin],undefined);assert.equal((await D.getAll("outbox")).length,rows.length);
 await send(1,el("",[...children,el("extra")]));assert.equal(p.truncationByOrigin[origin].count,1);
});
test("closed-document cleanup preserves counts and storage cap refuses without eviction",async()=>{
 const {p,send}=await fixture();await send(1,el("x".repeat(2001)));await send(2,el("x".repeat(2001)));
 await p.pruneTruncationDocuments(slot=>slot!=="1:0");assert.equal(p.truncationByOrigin[origin].count,2);
 assert.equal(Object.keys(p.truncationByOrigin[origin].documents).length,1);
 // Capacity injection adds bounded non-content metadata; actual admission must refuse.
 const before=structuredClone(p.truncationByOrigin);
 p.truncationByOrigin["https://capacity.test"]={sequence:0,dismissedThrough:0,count:0,documents:{},padding:"x".repeat(1024*1024)};
 const rows=(await D.getAll("outbox")).length;
 await send(3,el("x".repeat(2001)),false);
 assert.deepEqual(p.truncationByOrigin[origin],before[origin]);assert.equal((await D.getAll("outbox")).length,rows);
});

test("pre-repair profiles preserve retained occurrences and old dismissal actions",async()=>{
 const {p,send}=await fixture();const page=el("x".repeat(2001));
 const skim=SolstoneSkim.skim(page,{skip:null,boundary:null});
 const legacy=`doc-1:${SolstoneBlocks.hashStr(JSON.stringify(skim.blocks))}:true:${skim.clips.slice().sort().join(",")}`;
 p.truncationByOrigin[origin]={count:1,newestId:legacy,dismissThroughId:"",pending:[legacy],dismissed:[]};
 await D.put("meta",p.truncationByOrigin,"truncationByOrigin");
 await send(1,page);assert.equal(p.truncationByOrigin[origin].count,1);
 assert.equal((await p.dismissTruncation(origin,legacy)).dismissed,true);
 assert.equal(p.truncationByOrigin[origin].count,0);
 R.frameBindings.clear();p.truncationByOrigin=await D.get("meta","truncationByOrigin");
 await send(1,page);assert.equal(p.truncationByOrigin[origin].count,0);
 await send(1,el("y".repeat(2001)));assert.equal(p.truncationByOrigin[origin].count,1);
 await p.dismissTruncation(origin,legacy);assert.equal(p.truncationByOrigin[origin].count,1);
});

test("legacy dismissed omission becomes new after an observed unclipped interval",async()=>{
 const {p,send}=await fixture();const children=Array.from({length:1500},(_,i)=>el("text "+i));
 const page=el("",[...children,el("extra")]);const skim=SolstoneSkim.skim(page,{skip:null,boundary:null});
 const legacy=`doc-1:${SolstoneBlocks.hashStr(JSON.stringify(skim.blocks))}:true:${skim.clips.slice().sort().join(",")}`;
 p.truncationByOrigin[origin]={count:0,newestId:legacy,dismissThroughId:legacy,pending:[],dismissed:[legacy]};
 await send(1,el("",children));await send(1,page);
 assert.equal(p.truncationByOrigin[origin].count,1);
});
