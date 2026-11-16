(function () {
  "use strict";
  if (window.StashSavedQueues) return;
  const api = window.PluginApi, core = window.StashSavedQueuesCore;
  if (!api?.React || !api.register?.route || !core) return;
  const React = api.React, h = React.createElement, route = "/plugins/saved-scene-queues";
  const base = document.querySelector("base")?.getAttribute("href") || "/";
  // Access storage lazily so blocked storage is a UI error, not a startup failure.
  const store = core.createStore({ getItem:key=>window.localStorage.getItem(key), setItem:(key,value)=>window.localStorage.setItem(key,value) });
  async function findIDs(ids, signal) {
    const response = await fetch(base + "graphql", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(core.lookupRequest(ids)),signal });
    if (!response.ok) throw new Error("Scene validation request failed.");
    const data = await response.json(); if (data.errors?.length) throw new Error("Scene validation failed; session queue kept.");
    return Object.values(data.data).filter(Boolean).map(s => String(s.id));
  }
  async function load(id, mode, { signal } = {}) {
    const queue = store.list().find(q => q.id === id);
    if (!queue) throw new Error("Saved queue no longer exists.");
    if (!window.StashSessionQueue?.replace) throw new Error("Session Scene Queue is unavailable.");
    return core.loadIntoSession(queue, mode, window.StashSessionQueue, ids => findIDs(ids, signal), signal);
  }
  function Page() {
    const [queues,setQueues]=React.useState([]),[selected,setSelected]=React.useState(""),[name,setName]=React.useState("");
    const [busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(""),[pendingDelete,setPendingDelete]=React.useState(false),[count,setCount]=React.useState(window.StashSessionQueue?.getSceneIDs().length || 0);
    const current=queues.find(q=>q.id===selected);
    const lifecycle=React.useRef(null);
    function refresh(){ try{setQueues(store.list());}catch(e){setMessage(e.message);} setCount(window.StashSessionQueue?.getSceneIDs().length||0); }
    React.useEffect(()=>{ const controller=new AbortController();lifecycle.current=controller;refresh(); const changed=()=>refresh(); window.addEventListener("storage",changed); window.addEventListener("stash:session-scene-queue-changed",changed); return()=>{controller.abort();window.removeEventListener("storage",changed);window.removeEventListener("stash:session-scene-queue-changed",changed);}; },[]);
    async function run(work){const signal=lifecycle.current?.signal;setBusy(true);setMessage("");try{await work(signal);if(!signal?.aborted)refresh();}catch(e){if(!signal?.aborted){setMessage(e.message);window.CustomStashDiagnostics?.report("stash-session-queue","warning","SAVED_QUEUE_OPERATION_FAILED");}}finally{if(!signal?.aborted)setBusy(false);}}
    function save(asNew){run(()=>{const q=store.save(name,window.StashSessionQueue.getSceneIDs(),asNew?undefined:selected||undefined);setSelected(q.id);setName(q.name);setMessage("Saved "+q.sceneIDs.length+" scenes.");});}
    function apply(mode){run(async signal=>{const result=await load(selected,mode,{signal});if(!signal?.aborted)setMessage("Session queue: "+result.count+" scenes. "+result.missingIDs.length+" missing scenes skipped; saved list preserved.");});}
    const button=(label,fn,disabled=false)=>h("button",{type:"button",className:"btn btn-secondary",onClick:fn,disabled:busy||disabled},label);
    return h("main",{className:"ssq-saved-page","data-stash-vocabulary-preserve":"true"},h("h1",null,"Saved Queues"),
      h("a",{href:base+"plugins/session-queue-builder"},"Targeted Shuffle Queue"), h("p",null,"Session Queue: "+count+" scenes"),
      h("div",{className:"ssq-saved-layout"},
        h("section",null,h("h2",null,"Saved lists"),h("ul",{className:"ssq-saved-list"},queues.map(q=>h("li",{key:q.id},h("button",{type:"button",className:q.id===selected?"btn btn-primary":"btn btn-secondary",disabled:busy,onClick:()=>{setSelected(q.id);setName(q.name);setPendingDelete(false);setMessage("");}},q.name+" ("+q.sceneIDs.length+")")))),!queues.length&&h("p",null,"No saved queues.")),
        h("section",null,h("h2",null,current?current.name:"Save current queue"),h("label",null,"Queue name",h("input",{className:"form-control",value:name,maxLength:120,onChange:e=>setName(e.target.value)})),
          h("div",{className:"ssq-saved-actions"},button("Save current queue",()=>save(false),!name.trim()),button("Save As",()=>save(true),!name.trim()),button("Rename",()=>run(()=>{store.rename(selected,name);setMessage("Queue renamed.");}),!current||!name.trim())),
          current&&h(React.Fragment,null,h("p",null,current.sceneIDs.length+" saved scenes; updated "+new Date(current.updatedAt).toLocaleString()),
            h("div",{className:"ssq-saved-actions"},button("Load / Replace Session Queue",()=>apply("replace")),button("Append to Session Queue",()=>apply("append")),button("Delete saved queue",()=>setPendingDelete(true))),
            pendingDelete&&h("div",{className:"ssq-saved-confirm"},h("p",null,"Delete this saved list?"),button("Confirm delete",()=>run(()=>{store.remove(selected);setSelected("");setName("");setPendingDelete(false);setMessage("Saved list deleted.");})),button("Cancel",()=>setPendingDelete(false))))),
      ),message&&h("p",{role:"status"},message));
  }
  api.register.route(route,Page);
  window.StashSavedQueues={version:"1.8.1",schemaVersion:core.SCHEMA,route,list:()=>store.list(),save:(name,ids,id)=>store.save(name,ids,id),rename:(id,name)=>store.rename(id,name),remove:id=>store.remove(id),load};
})();

