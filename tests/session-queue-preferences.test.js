"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness(scenePreferences, options = {}) {
  const values = options.values || new Map();
  const localValues = options.localValues || new Map();
  const localStorage = {
    getItem(key) { return localValues.get(key) ?? null; },
    setItem(key, value) { localValues.set(key, String(value)); },
    removeItem(key) { localValues.delete(key); }
  };
  const sessionStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    __STASH_SESSION_QUEUE_TEST__: true,
    ScenePreferences: scenePreferences || null,
    PluginApi: options.pluginApi,
    sessionStorage,
    localStorage,
    performance: {getEntriesByType:()=>[{type:options.navigationType || "reload"}]},
    location: { origin: "http://stash.local", href: "http://stash.local/scenes/2", pathname: "/scenes/2", search: "", hash: "" },
    addEventListener() {},
    history: {
      replaceState(state, unused, url) { window.location = new URL(url, window.location.origin); },
      pushState(state, unused, url) { window.location = new URL(url, window.location.origin); }
    },
    dispatchEvent() {},
    requestAnimationFrame() {},
    setTimeout() {},
    clearTimeout,
    setInterval() {},
    clearInterval() {}
  };
  const context = vm.createContext({ window, document, console, Event: class Event {}, PopStateEvent: class PopStateEvent {}, CustomEvent: class CustomEvent {}, URL, Map, Set, Promise, Math, JSON, Number, String, Array, Object, Date, encodeURIComponent, fetch: options.fetch || function () { throw new Error("unexpected fetch"); } });
  const source = fs.readFileSync(path.join(__dirname, "..", "stash-session-queue.js"), "utf8");
  vm.runInContext(source, context, { filename: "stash-session-queue.js" });
  return { api: window.StashSessionQueueTest, window, values, localValues, source };
}

test("display follows shuffled playback and retains history without mutating the queue", async () => {
  const {api, window, values} = harness({generateShuffle: async () => ({sceneIDs:["2", "3", "1"], excludedSceneIDs:["4"]})});
  api.setQueue(["1", "2", "3", "4"]);
  await api.setShuffleEnabled(true);
  const snapshot = values.get("stash.tabScenePlayback.v1");
  window.location = new URL("http://stash.local/scenes/3");
  assert.deepEqual(Array.from(api.getQueueDisplayOrder()), ["2", "3", "1", "4"]);
  assert.equal(api.previousQueuedSceneID(), "2");
  assert.equal(api.nextQueuedSceneID(), "1");
  assert.deepEqual(Array.from(api.getQueue()), ["1", "2", "3", "4"]);
  assert.equal(values.get("stash.tabScenePlayback.v1"), snapshot);
});

test("display drag persists shuffle order without promoting excluded scenes", async () => {
  const {api, values} = harness({generateShuffle: async () => ({sceneIDs:["2", "3", "1"], excludedSceneIDs:["4"]})});
  api.setQueue(["1", "2", "3", "4"]);
  await api.setShuffleEnabled(true);
  api.moveDisplayedQueueItem(2, 1);
  api.moveDisplayedQueueItem(3, 0);
  api.moveDisplayedQueueItem(0, 3);
  assert.deepEqual(Array.from(api.getPlaybackOrder()), ["2", "1", "3"]);
  assert.deepEqual(Array.from(harness(null, {values}).api.getQueueDisplayOrder()), ["2", "1", "3", "4"]);
  await api.setShuffleEnabled(false);
  api.moveDisplayedQueueItem(3, 0);
  assert.deepEqual(Array.from(api.getQueueDisplayOrder()), ["4", "1", "2", "3"]);
});

test("current row aligns inside the list with room below the final scene", () => {
  const {api} = harness();
  const styles = new Map();
  const row = {offsetHeight:64, getBoundingClientRect:()=>({top:230})};
  const list = {
    clientHeight:400, clientTop:2, scrollTop:40,
    querySelector:()=>row,
    getBoundingClientRect:()=>({top:100}),
    style:{setProperty:(key, value)=>styles.set(key,value)}
  };
  assert.equal(api.alignCurrentQueueEntry(list), true);
  assert.equal(list.scrollTop,168);
  assert.equal(styles.get("--queue-tail-space"),"336px");
  list.clientHeight=0;
  assert.equal(api.alignCurrentQueueEntry(list), false);
  assert.equal(list.scrollTop,168);
  list.clientHeight=400;
  list.querySelector=()=>null;
  assert.equal(api.alignCurrentQueueEntry(list), false);
});

test("active queue and exact shuffle state survive refresh within the same tab", async () => {
  let generations = 0;
  const preferences = { generateShuffle() { generations++; return Promise.resolve({sceneIDs: ["3", "2"], excludedSceneIDs: ["1"]}); } };
  const first = harness(preferences);
  first.api.setQueue(["3", "1", "2"]);
  await first.api.setShuffleEnabled(true);
  const snapshot = first.values.get("stash.tabScenePlayback.v1");
  for (let i = 0; i < 3; i++) {
    const refreshed = harness(preferences, { values: first.values });
    assert.deepEqual(Array.from(refreshed.api.getQueue()), ["3", "1", "2"]);
    assert.deepEqual(Array.from(refreshed.api.getPlaybackOrder()), ["3", "2"]);
    assert.equal(refreshed.api.isShuffleEnabled(), true);
    assert.equal(first.values.get("stash.tabScenePlayback.v1"), snapshot);
  }
  assert.equal(generations, 1);
});

test("old active queues are discarded without deleting named saved queues", async () => {
  const key = "stash.sessionScenePlaybackQueue";
  const legacy = new Map([
    [key, JSON.stringify({sceneIDs:["9", "4", "7"]})],
    [key + ".shuffle", "true"],
    [key + ".shuffleOrder", JSON.stringify({sceneIDs:["7", "9"]})],
    [key + ".shuffleExcluded", JSON.stringify({sceneIDs:["4"]})],
    [key + ".shuffleGeneration", "existing-generation"],
    [key + ".shuffleExposed", JSON.stringify({sceneIDs:["7"]})]
  ]);
  const saved = JSON.stringify({schemaVersion:1,queues:[{name:"Saved",sceneIDs:["9"]}]});
  const localValues = new Map([["stash.activeScenePlayback.v1", JSON.stringify({schemaVersion:1, values:Object.fromEntries(legacy)})], ["stash.savedSceneQueues.v1",saved]]);
  const first = harness(null, {values:legacy, localValues});
  assert.deepEqual(Array.from(first.api.getPlaybackOrder()), []);
  assert.equal(localValues.has("stash.activeScenePlayback.v1"), false);
  assert.equal(localValues.get("stash.savedSceneQueues.v1"), saved);
  assert.equal(legacy.has(key), false);
  first.api.clearQueue();
  const refreshed = harness(null, {values:first.values, localValues});
  assert.deepEqual(Array.from(refreshed.api.getQueue()), []);
  refreshed.window.location = new URL("http://stash.local/scenes/9?qs=9&qs=4&autoplay=true");
  assert.equal(await refreshed.api.importNativeQueueFromLocation(true), false);
  assert.deepEqual(Array.from(refreshed.api.getQueue()), []);
  assert.equal(refreshed.window.location.search, "?autoplay=true");
});

test("refresh preserves reordered queue despite native filter or selected-scene URL", async () => {
  const first = harness();
  first.api.setQueue(["1", "2", "3"]);
  first.api.moveQueueItem(2, 0);
  for (const query of ["?qfp=1&autoplay=true", "?qs=8&qs=9&autoplay=true"]) {
    const refreshed = harness(null, {values:first.values});
    refreshed.window.location = new URL("http://stash.local/scenes/8" + query);
    assert.equal(await refreshed.api.importNativeQueueFromLocation(true), false);
    assert.deepEqual(Array.from(refreshed.api.getQueue()), ["3", "1", "2"]);
  }
  const explicit = harness(null, {values:first.values});
  explicit.window.location = new URL("http://stash.local/scenes/8?qs=8&qs=9");
  explicit.api.markNativeFilterQueueIntent();
  assert.equal(await explicit.api.importNativeQueueFromLocation(), true);
  assert.deepEqual(Array.from(explicit.api.getQueue()), ["8", "9"]);
});

test("a pending filter import cannot overwrite a manual clear", async () => {
  let finish;
  const {api, window} = harness(null, {fetch: () => new Promise(resolve => { finish = resolve; })});
  api.setQueue(["1", "2"]);
  window.location = new URL("http://stash.local/scenes/3?qfp=1&autoplay=true");
  api.markNativeFilterQueueIntent();
  const importing = api.importNativeQueueFromLocation();
  assert.deepEqual(Array.from(api.getQueue()), ["1", "2"]);
  api.clearQueue();
  finish({ok:true, json:async()=>({data:{findScenes:{count:2,scenes:[{id:"3"},{id:"4"}]}}})});
  assert.equal(await importing, false);
  assert.deepEqual(Array.from(api.getQueue()), []);
});

test("tabs have independent active queues and a new tab starts empty", () => {
  const first = harness();
  first.api.setQueue(["1", "2"]);
  const other = harness(null, {localValues:first.localValues, navigationType:"navigate"});
  assert.deepEqual(Array.from(other.api.getQueue()), []);
  other.api.setQueue(["3"]);
  assert.deepEqual(Array.from(first.api.getQueue()), ["1", "2"]);
  first.api.clearQueue();
  assert.deepEqual(Array.from(other.api.getQueue()), ["3"]);
});

test("copied and browser-restored tab storage does not revive the queue", async () => {
  const first = harness();
  first.api.setQueue(["1", "2"]);
  await first.api.setShuffleEnabled(true);
  for (const navigationType of ["navigate", "back_forward"]) {
    const restored = harness(null, {values:new Map(first.values), navigationType});
    assert.deepEqual(Array.from(restored.api.getQueue()), []);
    assert.deepEqual(Array.from(restored.api.getPlaybackOrder()), []);
    assert.equal(restored.api.isShuffleEnabled(), false);
  }
  assert.deepEqual(Array.from(first.api.getQueue()), ["1", "2"]);
});

test("startup and history URLs never create a queue, even with autoplay or explicit IDs", async () => {
  for (const startup of [true, false]) {
    for (const query of ["?qfp=1&autoplay=true", "?qs=1&qs=2&autoplay=true", "?qfp=1&continue=true"]) {
      const {api, window} = harness(null, {navigationType:"navigate"});
      window.location = new URL("http://stash.local/scenes/1" + query);
      assert.equal(await api.importNativeQueueFromLocation(startup), false);
      assert.deepEqual(Array.from(api.getQueue()), []);
      assert.equal(window.location.search.includes("qfp"), false);
      assert.equal(window.location.search.includes("qs="), false);
    }
  }
});

test("explicit filter import still commits after the complete response", async () => {
  const {api, window} = harness(null, {fetch: async () => ({ok:true, json:async()=>({data:{findScenes:{count:2,scenes:[{id:"3"},{id:"4"}]}}})})});
  api.setQueue(["1", "2"]);
  window.location = new URL("http://stash.local/scenes/3?qfp=1&autoplay=true");
  api.markNativeFilterQueueIntent();
  assert.equal(await api.importNativeQueueFromLocation(), true);
  assert.deepEqual(Array.from(api.getQueue()), ["3", "4"]);
});

test("weighted exclusions for additions survive refresh without being shuffled back in", async () => {
  let generation = 0;
  const preferences = {generateShuffle: async () => ++generation === 1
    ? {sceneIDs:["2", "1"], excludedSceneIDs:[]}
    : {sceneIDs:["3"], excludedSceneIDs:["4"]}};
  const first = harness(preferences);
  first.api.setQueue(["1", "2"]);
  await first.api.setShuffleEnabled(true);
  first.api.addManyToQueue(["3", "4"]);
  await new Promise(resolve => setImmediate(resolve));
  const second = harness(preferences, {values:first.values});
  assert.deepEqual(Array.from(second.api.getPlaybackOrder()), ["2", "1", "3"]);
  assert.deepEqual(Array.from(second.api.getStoredSceneIDs("stash.sessionScenePlaybackQueue.shuffleExcluded")), ["4"]);
  assert.equal(generation, 2);
});

test("native scene callbacks retain queue ownership across parent rerenders without competing key bindings", () => {
  const { api, source } = harness();
  const original = { scene: { id: '2' }, onQueueNext() {}, onQueuePrevious() {}, onQueueRandom() {} };
  const first = api.patchSceneQueueCallbacks(original)[0];
  const second = api.patchSceneQueueCallbacks(original)[0];
  assert.equal(first.scene, original.scene);
  for (const key of ['onQueueNext', 'onQueuePrevious', 'onQueueRandom']) {
    assert.notEqual(first[key], original[key]);
    assert.equal(first[key], second[key]);
  }
  api.setQueue([]);
  assert.doesNotThrow(first.onQueueNext);
  assert.doesNotThrow(first.onQueuePrevious);
  assert.match(source, /patch\.before\("ScenePage", patchSceneQueueCallbacks\)/);
  assert.doesNotMatch(source, /mousetrap\.(?:bind|unbind)\("p /);
});

test("registered player callbacks advance only inside the shuffled queue, including after refresh", async () => {
  const patches = new Map();
  const pluginApi = {React:{createElement(){}}, patch:{before(name, fn){patches.set(name, fn);}}};
  const first = harness({generateShuffle:async()=>({sceneIDs:["11", "13", "12"], excludedSceneIDs:[]})}, {pluginApi});
  first.window.location = new URL("http://stash.local/scenes/11");
  first.api.setQueue(["11", "12", "13"]);
  await first.api.setShuffleEnabled(true);
  let nativeCalls = 0;
  const native = () => { nativeCalls++; };
  const props = id => ({scene:{id},onNext:native,onPrevious:native,onComplete:native,permitLoop:true});
  const patch = patches.get("ScenePlayer");
  assert.equal(typeof patch, "function");
  const current = patch(props("11"))[0];
  assert.equal(current.permitLoop, false);
  current.onNext();
  assert.equal(first.window.location.pathname, "/scenes/13");
  current.onComplete(); // Late completion from the old media must not skip another item.
  assert.equal(first.window.location.pathname, "/scenes/13");
  patch(props("13"))[0].onComplete();
  assert.equal(first.window.location.pathname, "/scenes/12");
  patch(props("12"))[0].onComplete(); // End of queue: never fall through to native playback.
  assert.equal(first.window.location.pathname, "/scenes/12");

  const refreshed = harness(null, {values:first.values});
  refreshed.window.location = new URL("http://stash.local/scenes/12");
  refreshed.api.patchScenePlayerCallbacks(props("12"))[0].onPrevious();
  assert.equal(refreshed.window.location.pathname, "/scenes/13");
  refreshed.api.patchScenePlayerCallbacks(props("13"))[0].onComplete();
  assert.equal(refreshed.window.location.pathname, "/scenes/12");
  assert.equal(nativeCalls, 0);
});

test("clearing a queue prevents fallback to native next/completion; embedded players keep their own controls", () => {
  const {api,window} = harness();
  let nativeCalls = 0;
  const props = {scene:{id:"2"},onComplete(){nativeCalls++;},onNext(){nativeCalls++;},onPrevious(){nativeCalls++;}};
  api.setQueue(["2", "3"]);
  const patched = api.patchScenePlayerCallbacks(props)[0];
  api.clearQueue();
  patched.onComplete();
  patched.onNext();
  assert.equal(nativeCalls, 0);
  assert.equal(window.location.pathname, "/scenes/2");
  window.location = new URL("http://stash.local/plugins/scene-descriptor-review");
  assert.equal(api.patchScenePlayerCallbacks(props)[0], props);
});

test("shuffle output is restricted to the requested queue even if a provider returns outside IDs", async () => {
  const {api} = harness({generateShuffle:async()=>({sceneIDs:["999", "2", "1", "2"],excludedSceneIDs:["888", "3"]})});
  const result = await api.generatePlaybackOrder(["1", "2", "3"], "999", {});
  assert.deepEqual(Array.from(result.sceneIDs), ["2", "1"]);
  assert.deepEqual(Array.from(result.excludedSceneIDs), ["3"]);
});

test("queue attachment never recreates skip controls on a disposed player", () => {
  const { api } = harness();
  const dead = { isDisposed: () => true, skipButtons() { throw Error('disposed player accessed'); } };
  const rootless = { isDisposed: () => false, el: () => null, skipButtons: dead.skipButtons };
  for (const player of [null, dead, rootless]) {
    assert.doesNotThrow(() => api.restorePlayerQueueControls(player));
    assert.doesNotThrow(() => api.configurePlayerQueueControls(player));
  }
});

test("saved replacement and variant additions preserve native queue guards, manual order and navigation", async () => {
  const {api,window}=harness();
  const ids=Array.from({length:2518},(_,i)=>String(i+1));
  api.setQueue(ids);
  api.moveQueueItem(0,2);
  assert.deepEqual(Array.from(api.getQueue()).slice(0,3),['2','3','1']);
  api.addManyToQueue(['2','3000','3001','3000']);
  assert.equal(api.getQueue().length,2520);
  assert.equal(api.previousQueuedSceneID(),null);
  assert.equal(api.nextQueuedSceneID(),'3');
  const ordinary=api.parseNativeQueueDescriptor('http://stash.local/scenes/2?qfp=1&continue=false');
  assert.equal(api.shouldImportNativeFilterQueue(ordinary),false);
  await api.setShuffleEnabled(true);
  assert.equal(api.getPlaybackOrder()[0],'2');
  assert.deepEqual(Array.from(api.getQueue()).slice(0,3),['2','3','1']);
  const random=api.parseNativeQueueDescriptor('http://stash.local/scenes/2?qfp=1&autoplay=true');
  assert.equal(api.shouldImportNativeFilterQueue(random),false);
  api.markNativeFilterQueueIntent();
  assert.equal(api.shouldImportNativeFilterQueue(random),true);
  assert.equal(api.cleanNativeQueueURL(ordinary.url,false),'/scenes/2');
});

test("uniform fallback keeps current scene first and does not duplicate IDs", async () => {
  const { api } = harness();
  const result = await api.generatePlaybackOrder(["1", "2", "2", "3"], "2", {});
  assert.equal(result.preferenceAware, false);
  assert.equal(result.sceneIDs[0], "2");
  assert.equal(new Set(result.sceneIDs).size, 3);
});

test("preference-aware generation delegates without changing the visible queue", async () => {
  const calls = [];
  const preferences = {
    getConfig() { return Promise.resolve({ defaultIgnorePreferenceWeights: false, defaultIncludeExcluded: false }); },
    generateShuffle(ids, options) { calls.push({ ids: ids.slice(), options }); return Promise.resolve({ sceneIDs: ["2", "3"], excludedSceneIDs: ["1"] }); }
  };
  const { api } = harness(preferences);
  api.setQueue(["1", "2", "3"]);
  await api.setShuffleEnabled(true, { ignorePreferenceWeights: true, includeExcluded: false });
  assert.deepEqual(Array.from(api.getQueue()), ["1", "2", "3"]);
  assert.deepEqual(Array.from(api.getPlaybackOrder()), ["2", "3"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.ignorePreferenceWeights, true);
});

test("generated shuffle remains stable until explicit regeneration", async () => {
  let generation = 0;
  const preferences = {
    getConfig() { return Promise.resolve({ defaultIgnorePreferenceWeights: false, defaultIncludeExcluded: false }); },
    generateShuffle() { generation += 1; return Promise.resolve({ sceneIDs: generation === 1 ? ["2", "1", "3"] : ["3", "1", "2"], excludedSceneIDs: [] }); }
  };
  const { api } = harness(preferences);
  api.setQueue(["1", "2", "3"]);
  await api.setShuffleEnabled(true);
  assert.deepEqual(Array.from(api.getPlaybackOrder()), ["2", "1", "3"]);
  assert.deepEqual(Array.from(api.getPlaybackOrder()), ["2", "1", "3"]);
  assert.equal(generation, 1);
  await api.regenerateShuffleOrder();
  assert.deepEqual(Array.from(api.getPlaybackOrder()), ["3", "1", "2"]);
  assert.equal(generation, 2);
});

test("fully excluded pools fail usefully and leave shuffle disabled", async () => {
  const preferences = {
    getConfig() { return Promise.resolve({ defaultIgnorePreferenceWeights: false, defaultIncludeExcluded: false }); },
    generateShuffle() { return Promise.resolve({ sceneIDs: [], excludedSceneIDs: ["1", "2"] }); }
  };
  const { api } = harness(preferences);
  api.setQueue(["1", "2"]);
  await assert.rejects(api.setShuffleEnabled(true), /No eligible scenes/);
  assert.equal(api.isShuffleEnabled(), false);
});

test("targeted builder contains preference overrides, exposure recording, and uniform fallback", () => {
  const { source } = harness();
  assert.match(source, /session-queue-targeted/);
  assert.match(source, /recordShuffleExposure/);
  assert.match(source, /Ignore Preference Weights/);
  assert.match(source, /Include Shuffle-Excluded Scenes/);
  assert.match(source, /Scene Preferences unavailable; using uniform shuffle/);
});

test("scene browser shuffle builds the plugin queue directly", () => {
  const { source } = harness();
  assert.match(source, /stash-session-queue-browse-shuffle/);
  assert.match(source, /Shuffle scenes using the current filters/);
  assert.match(source, /playCapturedBrowseQueue/);
  assert.match(source, /resolveBrowseQueueContext/);
  assert.match(source, /fetchAllSceneIDs\(context\)/);
  assert.doesNotMatch(source, /playRandom\.click\(\)/);
  assert.doesNotMatch(source, /current scene filter is not ready yet/i);
  assert.match(source, /filterGroup\.insertBefore\(browseShuffle, filterButton\.nextSibling\)/);
});

test("native explicit queues are recognized and canonicalized", () => {
  const { api } = harness();
  const descriptor = api.parseNativeQueueDescriptor("http://stash.local/scenes/5?qs=5&qs=7&autoplay=true");
  assert.deepEqual(Array.from(descriptor.explicitIDs), ["5", "7"]);
  assert.equal(descriptor.sceneID, "5");
  assert.equal(api.cleanNativeQueueURL(descriptor.url), "/scenes/5?autoplay=true&continue=true");
});

test("ordinary scene navigation does not import a filter queue", () => {
  const { api } = harness();
  const ordinary = api.parseNativeQueueDescriptor("http://stash.local/scenes/5?qfp=1&continue=false");
  const autoplay = api.parseNativeQueueDescriptor("http://stash.local/scenes/5?qfp=1&autoplay=true&continue=false");

  assert.equal(api.shouldImportNativeFilterQueue(ordinary), false);
  assert.equal(api.cleanNativeQueueURL(ordinary.url, false), "/scenes/5");
  assert.equal(api.shouldImportNativeFilterQueue(autoplay), false);

  api.markNativeFilterQueueIntent();
  assert.equal(api.shouldImportNativeFilterQueue(ordinary), true);
  assert.equal(api.shouldImportNativeFilterQueue(ordinary), false);
});

test("toolbar Play is treated as an explicit filter-queue request", () => {
  const { source } = harness();
  assert.match(source, /\.scene-list \.play-button/);
  assert.match(source, /classList\.contains\("play-button"\)/);
});

test("native hierarchical scene filters decode to GraphQL input", () => {
  const { api } = harness();
  const criterion = '("type":"tags","modifier":"INCLUDES","value":("items":[("id":"764","label":"Characters")],"excluded":[],"depth":1))';
  const params = new URLSearchParams("qfp=1&qfc=" + encodeURIComponent(criterion));
  const filter = api.decodeNativeSceneFilter(params);
  assert.deepEqual(Array.from(filter.tags.value), ["764"]);
  assert.deepEqual(Array.from(filter.tags.excludes), []);
  assert.equal(filter.tags.depth, 1);
  assert.equal(filter.tags.modifier, "INCLUDES");
});

test("scene browser URL provides a filter when the React snapshot is unavailable", () => {
  const { api } = harness();
  const criterion = '("type":"tags","modifier":"INCLUDES","value":("items":[("id":"764","label":"Characters")],"excluded":[],"depth":1))';
  const context = api.contextFromSceneBrowseURL(
    "http://stash.local/scenes?q=hero&sortby=created_at&sortdir=desc&c=" + encodeURIComponent(criterion)
  );
  assert.equal(context.findFilter.q, "hero");
  assert.equal(context.findFilter.sort, "created_at");
  assert.equal(context.findFilter.direction, "DESC");
  assert.deepEqual(Array.from(context.sceneFilter.tags.value), ["764"]);
});

test("source registers player queue replacement patches", () => {
  const { source } = harness();
  assert.match(source, /ScenePage\.Tabs/);
  assert.match(source, /ScenePage\.TabContent/);
  assert.match(source, /SessionQueuePlayerView/);
  assert.match(source, /importNativeQueueFromLocation/);
  assert.match(source, /registerQueueOwnershipPatches\(\);\s*ready\(init\)/);
});

