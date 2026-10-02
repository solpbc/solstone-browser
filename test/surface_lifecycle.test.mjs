// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../extension/",import.meta.url));
const tick=()=>new Promise(r=>setImmediate(r));
const origin='https://one.example';
const base={inst:'fixture',captureEpoch:20,everConnected:true,connected:true,handshake:'ready',brand:'chrome',platform:'mac',hostCapture:'permitted',hostDelivery:'delivered',hostFailure:null,lease:{freshnessMs:10000},custody:{full:false,stale:false},capturePermitted:true,addSiteEligible:true,consentVersion:1,chosenOrigins:[origin],grantedOrigins:[origin],inactiveOrigins:[],openTabs:{known:true,openOrigins:[origin],anyGrantedTabOpen:true}};
class Node {
 constructor(){this.children=[];this.listeners={};this.textContent='';this.hidden=false;this.value='';}
 addEventListener(k,v){this.listeners[k]=v;}
 append(...n){this.children.push(...n);}
 replaceChildren(...n){this.children=n;}
 focus(){}
}
function harness(surface){
 const nodes={};const node=id=>nodes[id]??=new Node();
 let live={...base},status,disconnect,connects=0,timers=[],messages=[],hold=false,callback,holdTab=false,tabCallback;
 const context=vm.createContext({URL,console,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},document:{getElementById:node,createElement:()=>new Node(),addEventListener(){}},chrome:{runtime:{getManifest:()=>({version:'0.2.0'}),sendMessage(m,cb){messages.push(m);if(m.cmd==='getState'){if(hold){hold=false;callback=cb;}else cb(live);}else cb({ok:true});},connect(){connects++;return {onMessage:{addListener(fn){status=fn;}},onDisconnect:{addListener(fn){disconnect=fn;}}};},openOptionsPage(){},reload(){}},tabs:{query(){if(holdTab){holdTab=false;return new Promise(r=>tabCallback=r);}return Promise.resolve([{url:origin}]);},create(){}},permissions:{request:async()=>true}}});
 for(const p of ['lib/copy.js','lib/about.js','lib/hosts.js','lib/status.js','lib/failures.js','lib/disclosure.js','lib/popup_view.js','lib/actions.js',surface+'.js'])vm.runInContext(fs.readFileSync(root+p,'utf8'),context,{filename:p});
 return {context,nodes,node,messages,reconnect(){timers.shift()?.();},get live(){return live;},set live(v){live=v;},status(s){status({type:'status',status:s});},disconnect(){disconnect();},hold(){hold=true;},settle(s){callback(s);},holdTab(){holdTab=true;},settleTab(){tabCallback([{url:origin}]);},get connects(){return connects;},headline(){return node(surface==='popup'?'verdictHeadline':'statusStateChip').textContent;}};
}

for (const surface of ["options", "popup"]) test(`${surface} closes immediately and renews status after worker restart`, async () => {
 const h=harness(surface); await tick();
 const connected=h.headline(); h.hold(); h.disconnect(); await tick();
 assert.notEqual(h.headline(),connected);
 const closed={...base,captureEpoch:1,connected:false,handshake:"closed",hostCapture:null,hostDelivery:null,lease:null,custody:null,capturePermitted:false,addSiteEligible:false};
 const expected=h.context.SolstoneStatus.derive(closed).headline;
 assert.equal(h.headline(),expected);
 h.status(base); await tick(); assert.equal(h.headline(),expected); // obsolete port
 h.settle(closed); await tick(); assert.equal(h.headline(),expected);
 h.reconnect(); assert.equal(h.connects,2);
 h.status({...base,captureEpoch:2}); await tick(); assert.equal(h.headline(),connected);
});
test("popup paints closed authority while active-tab lookup is pending",async()=>{
 const h=harness("popup");await tick();h.holdTab();
 const paused={...base,captureEpoch:21,hostCapture:"paused",capturePermitted:false,addSiteEligible:false};
 h.status(paused);await tick();
 assert.equal(h.headline(),h.context.SolstoneStatus.derive(paused).headline);
 assert.equal(h.node("currentPageState").textContent,h.context.SolstoneStatus.siteRow(origin,paused).label);
 h.settleTab();await tick();assert.equal(h.headline(),h.context.SolstoneStatus.derive(paused).headline);
});
test("full and stale custody remain named under every owner gate",async()=>{
 const h=harness("options");await tick();
 for(const hostCapture of ["paused","intake_off","not_paired","permitted"]){
  const d=h.context.SolstoneStatus.derive({...base,hostCapture,capturePermitted:hostCapture==="permitted",custody:{full:true,stale:true}});
  const kinds=[d.kind,...d.also.map(x=>x.kind)];
  assert(kinds.includes("app-store-full"),hostCapture);assert(kinds.includes("waiting-over-a-week"),hostCapture);
 }
});
test("settings never offers a site sheet under a closed add gate",async()=>{
 const h=harness("options");await tick();h.node("siteDisclosure").hidden=true;
 h.status({...base,hostCapture:"paused",capturePermitted:false,addSiteEligible:false});await tick();h.node("newHost").value="new.example";
 const submission=h.node("addForm").listeners.submit({preventDefault(){}});
 await tick();
 const offered=!h.node("siteDisclosure").hidden;
 if (offered) h.node("siteDisclosureCancel").listeners.click();
 await submission;
 assert.equal(offered,false);
 assert.equal(h.messages.some(m=>m.cmd==="intendAddOrigin"||m.cmd==="addGrantedOrigin"),false);
});
test("settings preserves secondary loss action and names each truncation origin",async()=>{
 const h=harness("options");await tick();h.status({...base,paused:true,lossNotice:{seq:3}});await tick();
 const loss=h.node("statusAlso").children.find(n=>n.children.length);
 assert(loss);assert.equal(loss.children.length,1);await loss.children[0].listeners.click();
 assert(h.messages.some(m=>m.cmd==="dismissLoss"));
 h.status({...base,truncationByOrigin:{[origin]:{count:2,newestId:"x"},"https://two.example":{count:1,newestId:"y"}}});await tick();
 const labels=h.node("siteList").children.filter(n=>n.className==="site-issue").map(n=>n.children[0].textContent);
 assert.deepEqual(labels,[origin,"https://two.example"]);
});
test("tab-dependent rows and welcome use their own projections",async()=>{
 const h=harness("options");await tick();const S=h.context.SolstoneStatus,C=h.context.SolstoneCopy;
 assert.equal(S.siteRow(origin,{...base,hostCapture:"intake_off",capturePermitted:false,openTabs:{known:false}}).kind,"added");
 assert.equal(S.siteRow(origin,{...base,hostCapture:"intake_off",capturePermitted:false,openTabs:{known:true,openOrigins:[]}}).kind,"added-idle");
 const paused=S.welcomeHold({...base,hostCapture:"paused",capturePermitted:false});
 assert.equal(paused.met,true);assert.notEqual(paused.heading,S.welcomeHold(base).heading);
 assert.equal(S.welcomeHold({...base,hostCapture:"not_paired",capturePermitted:false}).body,C.STEP1_NOT_PAIRED_BODY);
});

test("specific app holds take priority over concurrent full custody",async()=>{
 const h=harness("options");await tick();
 for (const failure of ["unaccepted_lost","local_io","resource_exhausted","age_policy"]) {
  const d=h.context.SolstoneStatus.derive({...base,hostCapture:"intake_off",hostFailure:failure,capturePermitted:false,custody:{full:true,stale:true}});
  assert.equal(d.kind,failure==="unaccepted_lost"?"lost-and-held":"intake-held");
  assert(d.also.some(x=>x.kind==="app-store-full"));
 }
 const d=h.context.SolstoneStatus.derive({...base,hostCapture:"intake_off",hostFailure:"queue_full",capturePermitted:false,custody:{full:true,stale:true}});
 assert.equal(d.kind,"app-store-full");
});
