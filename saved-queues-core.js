(function (root) {
  "use strict";
  const KEY = "stash.savedSceneQueues.v1", SCHEMA = 1;
  function ids(values) {
    if (!Array.isArray(values)) throw new Error("Queue IDs must be an array.");
    return [...new Set(values.map(String).filter(x => /^\d+$/.test(x)))];
  }
  function decode(raw) {
    if (raw === null || raw === undefined) return { schemaVersion: SCHEMA, queues: [] };
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (value?.schemaVersion !== SCHEMA) throw new Error("Unsupported saved queue schema; existing data has been preserved.");
    if (!Array.isArray(value.queues)) throw new Error("Invalid saved queue data; existing data has been preserved.");
    const seen = new Set();
    return { schemaVersion: SCHEMA, queues: value.queues.map(q => {
      if (!q || q.schemaVersion !== SCHEMA || typeof q.id !== "string" || !q.id || seen.has(q.id) || typeof q.name !== "string" || !q.name.trim() || q.type !== "static" || !Array.isArray(q.sceneIDs)) throw new Error("Invalid saved queue entry; data has been preserved.");
      seen.add(q.id);
      return { ...q, sceneIDs: ids(q.sceneIDs) };
    }) };
  }
  function createStore(storage, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID()) {
    function list() { return decode(storage.getItem(KEY)).queues; }
    function write(change) {
      const data = decode(storage.getItem(KEY));
      const result = change(data.queues);
      storage.setItem(KEY, JSON.stringify(data));
      return result;
    }
    return {
      list,
      save(name, sceneIDs, id) {
        const label = String(name || "").trim();
        if (!label || label.length > 120) throw new Error("Queue name must contain 1-120 characters.");
        const ordered = ids(sceneIDs);
        return write(queues => {
          const current = id ? queues.find(q => q.id === id) : null;
          if (id && !current) throw new Error("Saved queue was removed in another tab.");
          if (queues.some(q => q.id !== id && q.name.toLowerCase() === label.toLowerCase())) throw new Error("A queue with that name already exists.");
          const entry = { schemaVersion: SCHEMA, type: "static", id: current?.id || uuid(), name: label, sceneIDs: ordered, createdAt: current?.createdAt || now(), updatedAt: now() };
          if (current) queues.splice(queues.indexOf(current), 1, entry); else queues.push(entry);
          return entry;
        });
      },
      rename(id, name) { const q = list().find(q => q.id === id); if (!q) throw new Error("Saved queue no longer exists."); return this.save(name, q.sceneIDs, id); },
      remove(id) { return write(queues => { const index = queues.findIndex(q => q.id === id); if (index < 0) throw new Error("Saved queue no longer exists."); queues.splice(index, 1); }); }
    };
  }
  function checkAborted(signal) {
    if (signal?.aborted) throw new Error("Saved queue load cancelled; session queue kept.");
  }
  async function validateQueue(queue, findIDs, signal) {
    const ordered = ids(queue.sceneIDs), found = new Set();
    for (let offset = 0; offset < ordered.length; offset += 250) {
      checkAborted(signal);
      for (const id of await findIDs(ordered.slice(offset, offset + 250))) found.add(String(id));
    }
    checkAborted(signal);
    return { sceneIDs: ordered.filter(id => found.has(id)), missingIDs: ordered.filter(id => !found.has(id)) };
  }
  function lookupRequest(sceneIDs) {
    const ordered = ids(sceneIDs), variables = {};
    ordered.forEach((id, index) => { variables['id' + index] = id; });
    return { query: 'query(' + ordered.map((_, i) => '$id' + i + ':ID!').join(',') + ') { ' + ordered.map((_,i) => 's' + i + ':findScene(id:$id' + i + '){id}').join(' ') + ' }', variables };
  }
  async function loadIntoSession(queue, mode, session, findIDs, signal) {
    if (mode !== "append" && mode !== "replace") throw new Error("Choose append or replace.");
    const before = session.getSceneIDs().slice();
    const checked = await validateQueue(queue, findIDs, signal);
    if (JSON.stringify(session.getSceneIDs()) !== JSON.stringify(before)) throw new Error("Session queue changed during validation. Retry loading.");
    if (queue.sceneIDs.length && !checked.sceneIDs.length) throw new Error("All saved scenes are missing. Session queue kept.");
    const expected = mode === "append" ? ids(before.concat(checked.sceneIDs)) : checked.sceneIDs;
    if (mode === "append") session.addMany(checked.sceneIDs); else session.replace(checked.sceneIDs);
    if (JSON.stringify(session.getSceneIDs()) !== JSON.stringify(expected)) throw new Error("Session queue could not be saved. Check browser storage availability.");
    return { ...checked, count: expected.length };
  }
  const api = { KEY, SCHEMA, ids, decode, createStore, validateQueue, loadIntoSession, lookupRequest };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StashSavedQueuesCore = api;
})(typeof window !== "undefined" ? window : this);

