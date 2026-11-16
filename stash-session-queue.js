(function () {
  "use strict";

  var storageKey = "stash.sessionScenePlaybackQueue";
  var shuffleKey = "stash.sessionScenePlaybackQueue.shuffle";
  var shuffleOrderKey = "stash.sessionScenePlaybackQueue.shuffleOrder";
  var shuffleGenerationKey = "stash.sessionScenePlaybackQueue.shuffleGeneration";
  var shuffleExposedKey = "stash.sessionScenePlaybackQueue.shuffleExposed";
  var shuffleExcludedKey = "stash.sessionScenePlaybackQueue.shuffleExcluded";
  var fullscreenIntentKey = "stash.sessionScenePlaybackQueue.fullscreenIntent";
  var playbackStorageKey = "stash.tabScenePlayback.v1";
  var playbackSessionInitialized = false;
  var playbackKeys = [storageKey, shuffleKey, shuffleOrderKey, shuffleGenerationKey, shuffleExposedKey, shuffleExcludedKey];
  var queueChangedEvent = "stash:session-scene-queue-changed";
  var queueAddRequestEvent = "stash:session-scene-queue-add";
  var addButtonClass = "stash-session-queue-add";
  var browseShuffleButtonClass = "stash-session-queue-browse-shuffle";
  var panelID = "stash-session-queue-panel";
  var sceneCache = new Map();
  var loadingScenes = false;
  var collapsed = false;
  var dragFromIndex = null;
  var queueControlsPlayer = null;
  var originalForwardHandler = null;
  var originalBackwardHandler = null;
  var scheduledEnhance = false;
  var scheduledBrowseShuffle = false;
  var scheduledPanel = false;
  var shuffleBusy = false;
  var shuffleStatus = "";
  var preferenceDefaultsLoaded = false;
  var nextShuffleOptions = { ignorePreferenceWeights: false, includeExcluded: false };
  var savedShuffleDefaults = { ignorePreferenceWeights: false, includeExcluded: false };
  var pendingAdditionSignature = "";
  var floatingVisibleCount = 100;
  var sceneCacheChangedEvent = "stash:session-scene-queue-scenes-loaded";
  var nativeQueueContexts = new Map();
  var latestNativeQueueContext = null;
  var nativeQueueImportToken = 0;
  var nativeQueueImportSource = "";
  var nativeQueueStatus = "";
  var nativeFilterQueueIntentUntil = 0;

  var icons = {
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A1.5 1.5 0 1 1 7 6.5A1.5 1.5 0 0 1 4 6.5Zm5-.75h11v1.5H9v-1.5ZM4 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5-.75h11v1.5H9v-1.5ZM4 17.5A1.5 1.5 0 1 1 7 17.5a1.5 1.5 0 0 1-3 0Zm5-.75h7v1.5H9v-1.5Zm10 0v-3h1.5v3h3v1.5h-3v3H19v-3h-3v-1.5h3Z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7L8 5Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5h-2V6.4l-4.4 4.4-1.4-1.4L17.6 5H16V3ZM4 6h3.3l3.5 3.5-1.4 1.4L6.5 8H4V6Zm10.6 7.2L19 17.6V16h2v5h-5v-2h1.6l-4.4-4.4 1.4-1.4ZM4 16h2.5L17.2 5.3l1.4 1.4L7.3 18H4v-2Z"/></svg>',
    preferences: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.5-9.3-8.6C.7 8.8 2.5 4.5 6.7 4.1c2.1-.2 4 1 5.3 2.7 1.3-1.7 3.2-2.9 5.3-2.7 4.2.4 6 4.7 4 8.3C19 16.5 12 21 12 21Z"/></svg>',
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6V5Zm3 7 10-7v14L9 12Z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2V5ZM5 5l10 7-10 7V5Z"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 15 5-5 5 5H7Z"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5H7Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>',
    grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h2v2H8V5Zm6 0h2v2h-2V5ZM8 11h2v2H8v-2Zm6 0h2v2h-2v-2ZM8 17h2v2H8v-2Zm6 0h2v2h-2v-2Z"/></svg>'
  };

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function getBasePath() {
    var base = document.querySelector("base");
    var href = base && base.getAttribute("href") ? base.getAttribute("href") : "/";
    return href.charAt(href.length - 1) === "/" ? href : href + "/";
  }

  function isSceneBrowseRoute() {
    var basePath = getBasePath().replace(/\/$/, "");
    var pathname = String(window.location.pathname || "").replace(/\/$/, "");
    return pathname === (basePath + "/scenes").replace(/^\/\//, "/");
  }

  function isScenePlayerRoute() {
    return /\/scenes\/\d+\/?$/.test(String(window.location.pathname || ""));
  }

  function playCapturedBrowseQueue() {
    var context = resolveBrowseQueueContext();
    if (!context) {
      return Promise.reject(new Error("Could not read the active Stash scene filter."));
    }

    latestNativeQueueContext = context;
    nativeQueueStatus = "Building queue from the current scene filter...";
    schedulePanelRender();
    return fetchAllSceneIDs(context).then(function (sceneIDs) {
      if (!sceneIDs.length) {
        throw new Error("No scenes match the current filter.");
      }
      setQueue(sceneIDs);
      return setShuffleEnabled(true).catch(function () {
        setShuffleState(true, shuffleSceneIDs(sceneIDs), generationID("browse"), []);
      });
    }).then(function () {
      nativeQueueStatus = "";
      playQueue();
    }).catch(function (error) {
      nativeQueueStatus = error.message || String(error);
      schedulePanelRender();
      throw error;
    });
  }

  function ensureBrowseShuffleButton() {
    var existing = document.querySelector("." + browseShuffleButtonClass);
    if (!isSceneBrowseRoute()) {
      if (existing) existing.remove();
      return;
    }

    var toolbar = document.querySelector(".scene-list .filtered-list-toolbar");
    if (!toolbar || toolbar.classList.contains("has-selection")) {
      if (existing) existing.remove();
      return;
    }
    if (existing && toolbar.contains(existing)) return;
    if (existing) existing.remove();

    var filterButton = toolbar.querySelector(".filter-button");
    var filterGroup = filterButton && filterButton.closest(".btn-group");
    if (!filterButton || !filterGroup) return;

    var title = "Shuffle scenes using the current filters";
    var browseShuffle = document.createElement("button");
    browseShuffle.type = "button";
    browseShuffle.className = "btn btn-secondary " + browseShuffleButtonClass;
    browseShuffle.title = title;
    browseShuffle.setAttribute("aria-label", title);
    browseShuffle.innerHTML = icons.shuffle;
    browseShuffle.addEventListener("click", function () {
      browseShuffle.disabled = true;
      playCapturedBrowseQueue().catch(function (error) {
        browseShuffle.disabled = false;
        window.alert(error && error.message ? error.message : String(error));
      }).finally(function () {
        if (browseShuffle.isConnected) browseShuffle.disabled = false;
      });
    });

    filterGroup.insertBefore(browseShuffle, filterButton.nextSibling);
  }

  function scheduleBrowseShuffleButton() {
    if (scheduledBrowseShuffle) return;
    scheduledBrowseShuffle = true;
    window.requestAnimationFrame(function () {
      scheduledBrowseShuffle = false;
      ensureBrowseShuffleButton();
    });
  }

  function sceneURL(sceneID) {
    return getBasePath() + "scenes/" + encodeURIComponent(sceneID) + "?autoplay=true&continue=true";
  }

  function graphQLURL() {
    return getBasePath() + "graphql";
  }

  function normaliseSceneIDs(sceneIDs) {
    var seen = new Set();
    var ret = [];

    sceneIDs.forEach(function (sceneID) {
      var id = String(sceneID || "").trim();
      if (!id || seen.has(id)) {
        return;
      }

      seen.add(id);
      ret.push(id);
    });

    return ret;
  }

  function absoluteURL(value) {
    try {
      return new URL(value, window.location.origin || "http://stash.local");
    } catch (err) {
      return null;
    }
  }

  function nativeQueueContextKey(params) {
    return String(params.get("qfq") || "") + "|" + params.getAll("qfc").join("|");
  }

  function cleanNativeQueueURL(url, continuePlayback) {
    var clean = absoluteURL(url && url.href ? url.href : url);
    if (!clean) return "";
    ["qs", "qfp", "qsort", "qsortd", "qfq", "qfc"].forEach(function (key) {
      clean.searchParams.delete(key);
    });
    clean.searchParams.delete("continue");
    if (continuePlayback !== false) clean.searchParams.set("continue", "true");
    return clean.pathname + (clean.search ? clean.search : "") + (clean.hash || "");
  }

  function markNativeFilterQueueIntent() {
    nativeFilterQueueIntentUntil = Date.now() + 2500;
  }

  function shouldImportNativeFilterQueue(descriptor) {
    if (!descriptor) return false;
    if (Date.now() <= nativeFilterQueueIntentUntil) {
      nativeFilterQueueIntentUntil = 0;
      return true;
    }
    return false;
  }

  function rememberNativeFilterQueueIntent(event) {
    var target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    var action = target.closest(".scene-list .play-button, .scene-list .play-item, .scene-list-operations-dropdown .dropdown-item");
    if (!action) return;
    var label = String(action.textContent || "").trim().toLowerCase();
    if (action.classList.contains("play-button") || action.classList.contains("play-item") || label === "play" || label === "play random") {
      markNativeFilterQueueIntent();
    }
  }

  function replaceWithinStash(path) {
    var target = path.charAt(0) === "/" ? path : "/" + path;
    if (window.location.pathname + window.location.search + window.location.hash === target) return;
    try {
      window.history.replaceState({}, "", target);
      var event = typeof PopStateEvent === "function"
        ? new PopStateEvent("popstate", { state: window.history.state })
        : new Event("popstate");
      window.dispatchEvent(event);
    } catch (err) {
      window.location.replace(target);
    }
  }

  function restoreStructuralBraces(value) {
    var inString = false;
    var escape = false;
    return Array.from(String(value || "")).map(function (character) {
      if (escape) {
        escape = false;
        return character;
      }
      if (character === "\\" && inString) {
        escape = true;
        return character;
      }
      if (character === '"') {
        inString = !inString;
        return character;
      }
      if (!inString && character === "(") return "{";
      if (!inString && character === ")") return "}";
      return character;
    }).join("");
  }

  function labeledIDs(values) {
    return (Array.isArray(values) ? values : []).map(function (value) {
      return value && typeof value === "object" ? value.id : value;
    }).filter(function (value) {
      return value !== undefined && value !== null && String(value) !== "";
    }).map(String);
  }

  function nativeCriterionInput(criterion) {
    var modifier = criterion.modifier;
    var value = criterion.value;
    var input = { modifier: modifier };

    if (modifier === "IS_NULL" || modifier === "NOT_NULL") return input;
    if (value && !Array.isArray(value) && typeof value === "object" && Array.isArray(value.items)) {
      input.value = labeledIDs(value.items);
      input.excludes = labeledIDs(value.excluded);
      if (value.depth !== undefined) input.depth = value.depth;
      return input;
    }
    if (Array.isArray(value) && value.some(function (item) { return item && typeof item === "object" && item.id !== undefined; })) {
      input.value = labeledIDs(value);
      return input;
    }
    if (value && !Array.isArray(value) && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
      input.value = value.value;
      if (value.value2 !== undefined) input.value2 = value.value2;
      return input;
    }
    input.value = value;
    return input;
  }

  function decodeNativeSceneFilter(params) {
    var sceneFilter = {};
    params.getAll("qfc").forEach(function (encoded) {
      var criterion;
      try {
        criterion = JSON.parse(restoreStructuralBraces(encoded));
      } catch (err) {
        throw new Error("Could not decode Stash scene filter: " + (err.message || String(err)));
      }
      if (!criterion || !criterion.type) return;
      if (criterion.type === "custom_fields") {
        sceneFilter.custom_fields = Array.isArray(criterion.value) ? criterion.value : [];
        return;
      }
      if (criterion.type === "folder") {
        sceneFilter.files_filter = sceneFilter.files_filter || {};
        sceneFilter.files_filter.parent_folder = nativeCriterionInput(criterion);
        return;
      }
      sceneFilter[criterion.type] = nativeCriterionInput(criterion);
    });
    return sceneFilter;
  }

  function parseNativeQueueDescriptor(value) {
    var url = absoluteURL(value && value.href ? value.href : value);
    if (!url || !/\/scenes\/\d+\/?$/.test(url.pathname)) return null;
    var params = url.searchParams;
    var explicitIDs = normaliseSceneIDs(params.getAll("qs"));
    var hasFilterQueue = params.has("qfp");
    if (!explicitIDs.length && !hasFilterQueue) return null;
    return {
      url: url,
      sceneID: (url.pathname.match(/\/scenes\/(\d+)/) || [])[1] || null,
      explicitIDs: explicitIDs,
      hasFilterQueue: hasFilterQueue,
      contextKey: nativeQueueContextKey(params)
    };
  }

  function rememberNativeQueueContext(props) {
    var filter = props && props.filter;
    var queue = props && props.queue;
    var scenes = props && props.scenes;
    if (!filter || !queue || typeof filter.makeFindFilter !== "function" || typeof filter.makeFilter !== "function" || typeof queue.makeLink !== "function") return;
    var sampleID = scenes && scenes[0] ? String(scenes[0].id) : "0";
    var sample = absoluteURL(queue.makeLink(sampleID, { sceneIndex: 0 }));
    if (!sample) return;
    var context = {
      findFilter: Object.assign({}, filter.makeFindFilter()),
      sceneFilter: filter.makeFilter(),
      contextKey: nativeQueueContextKey(sample.searchParams)
    };
    nativeQueueContexts.set(context.contextKey, context);
    latestNativeQueueContext = context;
    if (nativeQueueContexts.size > 12) {
      nativeQueueContexts.delete(nativeQueueContexts.keys().next().value);
    }
  }

  function contextFromNativeQueue(descriptor) {
    var params = descriptor.url.searchParams;
    var remembered = nativeQueueContexts.get(descriptor.contextKey);
    var sort = params.get("qsort") || (remembered && remembered.findFilter.sort) || "date";
    var direction = params.get("qsortd") === "desc"
      ? "DESC"
      : params.get("qsortd") === "asc"
      ? "ASC"
      : sort === "date"
      ? "DESC"
      : "ASC";
    return {
      findFilter: {
        q: params.get("qfq") || (remembered && remembered.findFilter.q) || "",
        page: 1,
        per_page: 500,
        sort: sort,
        direction: direction
      },
      sceneFilter: remembered ? remembered.sceneFilter : decodeNativeSceneFilter(params),
      contextKey: descriptor.contextKey
    };
  }

  function contextFromRenderedSceneLink() {
    var links = document.querySelectorAll('a[href*="/scenes/"]');
    for (var i = 0; i < links.length; i += 1) {
      var descriptor = parseNativeQueueDescriptor(links[i].getAttribute("href") || "");
      if (descriptor && descriptor.hasFilterQueue) {
        return contextFromNativeQueue(descriptor);
      }
    }
    return null;
  }

  function contextFromSceneBrowseURL(value) {
    var browseURL = absoluteURL(value && value.href ? value.href : value);
    if (!browseURL) return null;
    var queueURL = absoluteURL(getBasePath() + "scenes/0");
    if (!queueURL) return null;
    var mappings = [
      ["q", "qfq"],
      ["sortby", "qsort"],
      ["sortdir", "qsortd"]
    ];
    mappings.forEach(function (mapping) {
      if (browseURL.searchParams.has(mapping[0])) {
        queueURL.searchParams.set(mapping[1], browseURL.searchParams.get(mapping[0]));
      }
    });
    browseURL.searchParams.getAll("c").forEach(function (criterion) {
      queueURL.searchParams.append("qfc", criterion);
    });
    queueURL.searchParams.set("qfp", browseURL.searchParams.get("p") || "1");
    var descriptor = parseNativeQueueDescriptor(queueURL);
    return descriptor ? contextFromNativeQueue(descriptor) : null;
  }

  function resolveBrowseQueueContext() {
    try {
      return contextFromRenderedSceneLink() ||
        latestNativeQueueContext ||
        contextFromSceneBrowseURL(window.location.href);
    } catch (error) {
      console.warn("[Session Scene Queue] Could not resolve the active scene filter", error);
      return latestNativeQueueContext;
    }
  }

  function fetchAllSceneIDs(context) {
    var query = "query SessionQueueTakeover($filter: FindFilterType, $scene_filter: SceneFilterType) { findScenes(filter: $filter, scene_filter: $scene_filter) { count scenes { id } } }";
    var baseFilter = Object.assign({}, context.findFilter || {}, { page: 1, per_page: 500 });
    function fetchPage(page) {
      return graphqlRequest(query, {
        filter: Object.assign({}, baseFilter, { page: page }),
        scene_filter: context.sceneFilter || {}
      }).then(function (data) {
        return data.findScenes;
      });
    }
    return fetchPage(1).then(function (first) {
      var pageCount = Math.ceil(Number(first.count || 0) / baseFilter.per_page);
      var pending = [];
      for (var page = 2; page <= pageCount; page += 1) pending.push(fetchPage(page));
      return Promise.all(pending).then(function (rest) {
        return normaliseSceneIDs([first].concat(rest).reduce(function (ids, result) {
          return ids.concat((result.scenes || []).map(function (scene) { return scene.id; }));
        }, []));
      });
    });
  }

  function importNativeQueueFromLocation(startup) {
    var descriptor = parseNativeQueueDescriptor(window.location.href);
    if (!descriptor || nativeQueueImportSource === descriptor.url.href) return Promise.resolve(false);
    // URLs (including autoplay and history entries) are not fresh user intent.
    if (startup || !shouldImportNativeFilterQueue(descriptor)) {
      nativeFilterQueueIntentUntil = 0;
      replaceWithinStash(cleanNativeQueueURL(descriptor.url, false));
      return Promise.resolve(false);
    }
    nativeQueueImportSource = descriptor.url.href;
    nativeQueueImportToken += 1;
    var token = nativeQueueImportToken;
    replaceWithinStash(cleanNativeQueueURL(descriptor.url));

    if (descriptor.explicitIDs.length) {
      nativeQueueStatus = "Imported " + descriptor.explicitIDs.length + " scenes from Stash playback.";
      setQueue(descriptor.explicitIDs);
      nativeQueueImportSource = "";
      return Promise.resolve(true);
    }

    nativeQueueStatus = "Importing Stash playback queue...";
    var previousState = window.sessionStorage.getItem(playbackStorageKey);
    return fetchAllSceneIDs(contextFromNativeQueue(descriptor)).then(function (sceneIDs) {
      if (token !== nativeQueueImportToken || previousState !== window.sessionStorage.getItem(playbackStorageKey)) return false;
      if (descriptor.sceneID && sceneIDs.indexOf(descriptor.sceneID) === -1) sceneIDs.unshift(descriptor.sceneID);
      setQueue(sceneIDs);
      nativeQueueStatus = "Imported " + sceneIDs.length + " scenes from Stash playback.";
      return true;
    }).catch(function (error) {
      if (token === nativeQueueImportToken) {
        nativeQueueStatus = "Queue import failed: " + (error.message || String(error));
        schedulePanelRender();
      }
      console.warn("[Session Scene Queue]", error);
      return false;
    }).finally(function () {
      if (nativeQueueImportSource === descriptor.url.href) nativeQueueImportSource = "";
    });
  }

  function initializePlaybackSession() {
    if (playbackSessionInitialized) return;
    playbackSessionInitialized = true;
    // Discard the old shared active queue, but never touch named saved queues.
    try { window.localStorage.removeItem("stash.activeScenePlayback.v1"); } catch (_) {}
    try {
      var navigation = window.performance && typeof window.performance.getEntriesByType === "function"
        ? window.performance.getEntriesByType("navigation")[0] : null;
      // Only a refresh retains this document's queue. New/copied/restored tabs
      // must not revive sessionStorage copied or restored by the browser.
      if (!navigation || navigation.type !== "reload") {
        window.sessionStorage.removeItem(playbackStorageKey);
        window.sessionStorage.removeItem(fullscreenIntentKey);
      }
      playbackKeys.forEach(function (key) { window.sessionStorage.removeItem(key); });
    } catch (_) {}
  }

  function readPlaybackState() {
    initializePlaybackSession();
    var raw = window.sessionStorage.getItem(playbackStorageKey);
    if (raw !== null) {
      var state = JSON.parse(raw);
      if (!state || state.schemaVersion !== 1 || !state.values || typeof state.values !== "object" || Array.isArray(state.values)) {
        throw new Error("Unrecognized playback queue storage; existing data was preserved.");
      }
      return state.values;
    }
    return {};
  }

  function writePlaybackValues(changes) {
    var values = Object.assign({}, readPlaybackState());
    Object.keys(changes).forEach(function (key) {
      if (changes[key] === null) delete values[key];
      else values[key] = changes[key];
    });
    window.sessionStorage.setItem(playbackStorageKey, JSON.stringify({ schemaVersion: 1, values: values }));
  }

  function getQueue() {
    try {
      var stored = readPlaybackState()[storageKey];
      if (!stored) {
        return [];
      }

      var parsed = JSON.parse(stored);
      return normaliseSceneIDs(parsed.sceneIDs || []);
    } catch (err) {
      return [];
    }
  }

  function setQueue(sceneIDs) {
    var normalised = normaliseSceneIDs(sceneIDs);
    try {
      writePlaybackValues({ [storageKey]: JSON.stringify({ sceneIDs: normalised }) });
      nativeQueueImportToken += 1;
      pendingAdditionSignature = "";
      reconcileShuffleOrder(normalised);
    } catch (err) {
      return getQueue();
    }

    window.dispatchEvent(new Event(queueChangedEvent));
    if (normalised.length === 0) floatingVisibleCount = 100;
    return normalised;
  }

  function addToQueue(sceneID) {
    var current = getQueue();
    if (current.indexOf(String(sceneID)) !== -1) {
      return current;
    }

    return setQueue(current.concat([sceneID]));
  }

  function addManyToQueue(sceneIDs) {
    var requested = normaliseSceneIDs(Array.isArray(sceneIDs) ? sceneIDs : []);
    var before = getQueue();
    var beforeSet = new Set(before);
    var added = requested.filter(function (sceneID) {
      return !beforeSet.has(sceneID);
    });
    var queue = added.length ? setQueue(before.concat(added)) : before;
    if (!added.length) schedulePanelRender();
    return {
      queue: queue.slice(),
      addedSceneIDs: added.slice()
    };
  }

  function removeFromQueue(sceneID) {
    setQueue(getQueue().filter(function (id) {
      return id !== String(sceneID);
    }));
  }

  function clearQueue() {
    setQueue([]);
  }

  function moveQueueItem(fromIndex, toIndex) {
    var ids = getQueue();
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length) {
      return;
    }

    var moved = ids.splice(fromIndex, 1)[0];
    ids.splice(toIndex, 0, moved);
    setQueue(ids);
  }

  function getStoredSceneIDs(key) {
    try {
      var stored = readPlaybackState()[key];
      if (!stored) {
        return [];
      }

      var parsed = JSON.parse(stored);
      return normaliseSceneIDs(parsed.sceneIDs || []);
    } catch (err) {
      return [];
    }
  }

  function setStoredSceneIDs(key, sceneIDs) {
    try {
      writePlaybackValues({ [key]: JSON.stringify({ sceneIDs: normaliseSceneIDs(sceneIDs) }) });
    } catch (err) {
      // Ignore unavailable sessionStorage.
    }
  }

  function isShuffleEnabled() {
    try {
      return readPlaybackState()[shuffleKey] === "true";
    } catch (err) {
      return false;
    }
  }

  function shuffleSceneIDs(sceneIDs) {
    var shuffled = sceneIDs.slice();
    for (var i = shuffled.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    return shuffled;
  }

  function makeShuffleOrder(queue, current) {
    var ids = normaliseSceneIDs(queue);
    var currentID = current ? String(current) : null;
    if (!currentID || ids.indexOf(currentID) === -1) {
      return shuffleSceneIDs(ids);
    }

    var remaining = ids.filter(function (id) {
      return id !== currentID;
    });
    return [currentID].concat(shuffleSceneIDs(remaining));
  }

  function scenePreferencesAPI() {
    var api = window.ScenePreferences;
    return api && typeof api.generateShuffle === "function" ? api : null;
  }

  function generationID(prefix) {
    return String(prefix || "queue") + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
  }

  function preferenceShuffleOptions(overrides) {
    return Object.assign({}, nextShuffleOptions, overrides || {});
  }

  function loadPreferenceDefaults(force) {
    var api = scenePreferencesAPI();
    if (!api || typeof api.getConfig !== "function" || (preferenceDefaultsLoaded && !force)) return Promise.resolve(nextShuffleOptions);
    return api.getConfig({ fresh: !!force }).then(function (config) {
      savedShuffleDefaults = {
        ignorePreferenceWeights: !!config.defaultIgnorePreferenceWeights,
        includeExcluded: !!config.defaultIncludeExcluded
      };
      nextShuffleOptions = Object.assign({}, savedShuffleDefaults);
      preferenceDefaultsLoaded = true;
      schedulePanelRender();
      return nextShuffleOptions;
    }).catch(function () { return nextShuffleOptions; });
  }

  function generatePlaybackOrder(queue, current, overrides) {
    var ids = normaliseSceneIDs(queue);
    var api = scenePreferencesAPI();
    var options = preferenceShuffleOptions(overrides);
    if (!api) {
      return Promise.resolve({ sceneIDs: makeShuffleOrder(ids, current), excludedSceneIDs: [], report: null, preferenceAware: false });
    }
    return api.generateShuffle(ids, {
      currentSceneId: current || null,
      ignorePreferenceWeights: !!options.ignorePreferenceWeights,
      includeExcluded: !!options.includeExcluded,
      source: "session-queue-standard"
    }).then(function (result) {
      var allowed = new Set(ids);
      result.sceneIDs = normaliseSceneIDs(result.sceneIDs || []).filter(function (id) { return allowed.has(id); });
      result.excludedSceneIDs = normaliseSceneIDs(result.excludedSceneIDs || []).filter(function (id) { return allowed.has(id); });
      result.preferenceAware = true;
      return result;
    });
  }

  function setShuffleState(enabled, order, generation, excludedSceneIDs) {
    try {
      var changes = {};
      if (enabled) {
        changes[shuffleKey] = "true";
        changes[shuffleOrderKey] = JSON.stringify({ sceneIDs: normaliseSceneIDs(order || []) });
        changes[shuffleGenerationKey] = generation || generationID("standard");
        changes[shuffleExposedKey] = null;
        changes[shuffleExcludedKey] = JSON.stringify({ sceneIDs: normaliseSceneIDs(excludedSceneIDs || []) });
      } else {
        [shuffleKey, shuffleOrderKey, shuffleGenerationKey, shuffleExposedKey, shuffleExcludedKey].forEach(function (key) { changes[key] = null; });
      }
      writePlaybackValues(changes);
    } catch (err) {
      // Ignore unavailable sessionStorage.
    }
    window.dispatchEvent(new Event(queueChangedEvent));
  }

  function setShuffleEnabled(enabled, overrides) {
    if (!enabled) {
      setShuffleState(false);
      shuffleStatus = "";
      schedulePanelRender();
      return Promise.resolve({ sceneIDs: getQueue(), preferenceAware: false });
    }
    if (shuffleBusy) return Promise.reject(new Error("A shuffle is already being generated."));
    shuffleBusy = true;
    var previousState = window.sessionStorage.getItem(playbackStorageKey);
    shuffleStatus = "Building preference-aware shuffle...";
    schedulePanelRender();
    return loadPreferenceDefaults(false).then(function () {
      return generatePlaybackOrder(getQueue(), currentSceneID(), overrides);
    }).then(function (result) {
      if (previousState !== window.sessionStorage.getItem(playbackStorageKey)) throw new Error("Queue changed while shuffling; current queue kept.");
      if (!result.sceneIDs || !result.sceneIDs.length) throw new Error("No eligible scenes remain. Restore an excluded scene or enable Include Shuffle-Excluded Scenes.");
      var generation = generationID("standard");
      setShuffleState(true, result.sceneIDs, generation, result.excludedSceneIDs || []);
      shuffleStatus = result.preferenceAware
        ? "Preference-aware playback order generated" + (result.excludedSceneIDs && result.excludedSceneIDs.length ? "; skipped " + result.excludedSceneIDs.length + " excluded" : "") + "."
        : "Uniform playback order generated; Scene Preferences is unavailable.";
      nextShuffleOptions = Object.assign({}, savedShuffleDefaults);
      return Object.assign({}, result, { generationId: generation });
    }).catch(function (error) {
      if (previousState === window.sessionStorage.getItem(playbackStorageKey)) setShuffleState(false);
      shuffleStatus = error.message || String(error);
      throw error;
    }).finally(function () {
      shuffleBusy = false;
      schedulePanelRender();
    });
  }

  function toggleShuffle() {
    return setShuffleEnabled(!isShuffleEnabled()).catch(function (error) {
      console.warn("[Session Scene Queue]", error);
    });
  }

  function regenerateShuffleOrder(overrides) {
    return setShuffleEnabled(false).then(function () { return setShuffleEnabled(true, overrides); });
  }

  function reconcileShuffleOrder(queue) {
    if (!isShuffleEnabled()) {
      return;
    }

    var ids = normaliseSceneIDs(queue);
    var queueSet = new Set(ids);
    var order = getStoredSceneIDs(shuffleOrderKey).filter(function (id) {
      return queueSet.has(id);
    });
    var orderSet = new Set(order);
    var excludedSet = new Set(getStoredSceneIDs(shuffleExcludedKey));
    var additions = ids.filter(function (id) {
      return !orderSet.has(id) && !excludedSet.has(id);
    });

    if (additions.length > 0) {
      order = order.concat(shuffleSceneIDs(additions));
      var signature = additions.slice().sort().join(",") + "|" + order.filter(function (id) { return additions.indexOf(id) === -1; }).join(",");
      if (scenePreferencesAPI() && signature !== pendingAdditionSignature) {
        pendingAdditionSignature = signature;
        var stableOrder = order.filter(function (id) { return additions.indexOf(id) === -1; });
        generatePlaybackOrder(additions, null, {}).then(function (result) {
          if (!isShuffleEnabled() || pendingAdditionSignature !== signature || pendingState !== window.sessionStorage.getItem(playbackStorageKey)) return;
          writePlaybackValues({
            [shuffleOrderKey]: JSON.stringify({ sceneIDs: normaliseSceneIDs(stableOrder.concat(result.sceneIDs || [])) }),
            [shuffleExcludedKey]: JSON.stringify({ sceneIDs: normaliseSceneIDs(Array.from(excludedSet).concat(result.excludedSceneIDs || [])) })
          });
          pendingAdditionSignature = "";
          window.dispatchEvent(new Event(queueChangedEvent));
        }).catch(function (error) {
          pendingAdditionSignature = "";
          shuffleStatus = "New queue items used uniform order: " + (error.message || String(error));
          schedulePanelRender();
        });
      }
    }

    setStoredSceneIDs(shuffleOrderKey, order);
    var pendingState = window.sessionStorage.getItem(playbackStorageKey);
  }

  function getPlaybackOrder() {
    var queue = getQueue();
    if (!isShuffleEnabled()) {
      return queue;
    }

    var order = getStoredSceneIDs(shuffleOrderKey).filter(function (id) { return queue.indexOf(id) !== -1; });
    return order;
  }

  function getQueueDisplayOrder() {
    var order = getPlaybackOrder();
    var included = new Set(order);
    // Keep excluded items available for removal without putting them in playback.
    return order.concat(getQueue().filter(function (id) { return !included.has(id); }));
  }

  function moveDisplayedQueueItem(fromIndex, toIndex) {
    if (!isShuffleEnabled()) return moveQueueItem(fromIndex, toIndex);
    var order = getPlaybackOrder();
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
        fromIndex >= order.length || toIndex >= order.length) return;
    order.splice(toIndex, 0, order.splice(fromIndex, 1)[0]);
    setStoredSceneIDs(shuffleOrderKey, order);
    window.dispatchEvent(new Event(queueChangedEvent));
  }

  function alignCurrentQueueEntry(list) {
    if (!list || !list.clientHeight) return false;
    var row = list.querySelector(".is-current");
    if (!row) return false;
    // The final row needs trailing space too; scroll only this list, not the page.
    list.style.setProperty("--queue-tail-space", Math.max(0, list.clientHeight - row.offsetHeight) + "px");
    list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientTop;
    return true;
  }

  function currentSceneID() {
    var match = window.location.pathname.match(/\/scenes\/(\d+)/);
    return match ? match[1] : null;
  }

  function getCurrentPlayer() {
    var pluginApi = window.PluginApi;
    return pluginApi &&
      pluginApi.utils &&
      pluginApi.utils.InteractiveUtils &&
      typeof pluginApi.utils.InteractiveUtils.getPlayer === "function"
      ? pluginApi.utils.InteractiveUtils.getPlayer()
      : null;
  }

  function isPlayerFullscreen(player) {
    try {
      return !!(player && typeof player.isFullscreen === "function" && player.isFullscreen());
    } catch (err) {
      return false;
    }
  }

  function shouldPreserveFullscreen() {
    return isPlayerFullscreen(getCurrentPlayer()) || !!document.fullscreenElement;
  }

  function rememberFullscreenIntent() {
    try {
      if (shouldPreserveFullscreen()) {
        window.sessionStorage.setItem(fullscreenIntentKey, "true");
      }
    } catch (err) {
      // Ignore unavailable sessionStorage.
    }
  }

  function clearFullscreenIntentIfRestored(player) {
    if (isPlayerFullscreen(player) || document.fullscreenElement) {
      try {
        window.sessionStorage.removeItem(fullscreenIntentKey);
      } catch (err) {
        // Ignore unavailable sessionStorage.
      }
    }
  }

  function restoreFullscreenIfNeeded() {
    var shouldRestore = false;

    try {
      shouldRestore = window.sessionStorage.getItem(fullscreenIntentKey) === "true";
    } catch (err) {
      shouldRestore = false;
    }

    if (!shouldRestore) {
      return;
    }

    var player = getCurrentPlayer();
    if (!player) {
      return;
    }

    if (isPlayerFullscreen(player) || document.fullscreenElement) {
      clearFullscreenIntentIfRestored(player);
      return;
    }

    try {
      if (typeof player.requestFullscreen === "function") {
        var request = player.requestFullscreen();
        if (request && typeof request.catch === "function") {
          request.catch(function () {});
        }
      }
    } catch (err) {
      // Browsers may reject fullscreen requests without user activation.
    }

    clearFullscreenIntentIfRestored(player);
  }

  function scheduleFullscreenRestore() {
    [50, 150, 350, 700, 1200].forEach(function (delay) {
      window.setTimeout(restoreFullscreenIfNeeded, delay);
    });
  }

  function navigateWithinStash(path) {
    var target = path.charAt(0) === "/" ? path : "/" + path;

    if (window.location.pathname + window.location.search === target) {
      return;
    }

    try {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    } catch (err) {
      window.location.assign(target);
    }
  }

  function recordReachedShuffleScene(sceneID) {
    if (!isShuffleEnabled() || !sceneID) return;
    var id = String(sceneID);
    var exposed = getStoredSceneIDs(shuffleExposedKey);
    if (exposed.indexOf(id) !== -1) return;
    var api = scenePreferencesAPI();
    if (!api || typeof api.recordShuffleExposure !== "function") return;
    var generation = "";
    try { generation = readPlaybackState()[shuffleGenerationKey] || ""; } catch (_) {}
    if (!generation) return;
    setStoredSceneIDs(shuffleExposedKey, exposed.concat([id]));
    api.recordShuffleExposure([id], { generationId: generation, source: "session-queue-standard" }).catch(function (error) {
      setStoredSceneIDs(shuffleExposedKey, getStoredSceneIDs(shuffleExposedKey).filter(function (value) { return value !== id; }));
      shuffleStatus = "Could not record shuffle exposure: " + (error.message || String(error));
      schedulePanelRender();
    });
  }

  function navigateToScene(sceneID) {
    rememberFullscreenIntent();
    navigateWithinStash(sceneURL(sceneID));
    schedulePlayerAttachment();
    scheduleFullscreenRestore();
    recordReachedShuffleScene(sceneID);
  }

  function playQueue() {
    var ids = getPlaybackOrder();
    if (ids.length > 0) {
      navigateToScene(ids[0]);
    }
  }

  function nextQueuedSceneID() {
    var ids = getPlaybackOrder();
    if (ids.length === 0) {
      return null;
    }

    var current = currentSceneID();
    var index = current ? ids.indexOf(current) : -1;
    if (index === -1) {
      return ids[0];
    }

    return index < ids.length - 1 ? ids[index + 1] : null;
  }

  function previousQueuedSceneID() {
    var ids = getPlaybackOrder();
    if (ids.length === 0) {
      return null;
    }

    var current = currentSceneID();
    var index = current ? ids.indexOf(current) : -1;
    return index > 0 ? ids[index - 1] : null;
  }

  function queueNextHandler() {
    var next = nextQueuedSceneID();
    if (next) {
      navigateToScene(next);
    }
  }

  function queuePreviousHandler() {
    var previous = previousQueuedSceneID();
    if (previous) {
      navigateToScene(previous);
    }
  }

  function queueRandomHandler() {
    if (isShuffleEnabled()) {
      queueNextHandler();
    } else {
      setShuffleEnabled(true).then(queueNextHandler).catch(function () {});
    }
  }

  function patchSceneQueueCallbacks(props) {
    return [Object.assign({}, props, {
      onQueueNext: queueNextHandler,
      onQueuePrevious: queuePreviousHandler,
      onQueueRandom: queueRandomHandler
    })];
  }

  function patchScenePlayerCallbacks(props) {
    // Embedded review players own their navigation; only replace the scene page player.
    if (!isScenePlayerRoute() || !props.scene) return [props];
    var sceneID = String(props.scene.id);
    function forCurrentScene(handler) {
      return function () {
        if (currentSceneID() === sceneID) handler();
      };
    }
    return [Object.assign({}, props, {
      onComplete: function () { onSceneEnded(sceneID); },
      onNext: forCurrentScene(queueNextHandler),
      onPrevious: forCurrentScene(queuePreviousHandler),
      permitLoop: getQueue().length ? false : props.permitLoop
    })];
  }

  queueNextHandler.stashSessionQueueHandler = true;
  queuePreviousHandler.stashSessionQueueHandler = true;

  function onSceneEnded(sceneID) {
    if (!isScenePlayerRoute() || String(sceneID) !== currentSceneID()) return;
    var next = nextQueuedSceneID();
    if (next) {
      navigateToScene(next);
    }
  }

  function isQueueHandler(handler) {
    return !!(handler && handler.stashSessionQueueHandler);
  }

  function isUsablePlayer(player) {
    return !!player && !(typeof player.isDisposed === "function" && player.isDisposed()) &&
      !(typeof player.el === "function" && !player.el());
  }

  function restorePlayerQueueControls(player) {
    if (!isUsablePlayer(player) || typeof player.skipButtons !== "function") {
      return;
    }

    var skipButtons = player.skipButtons();
    if (!skipButtons) {
      return;
    }

    if (isQueueHandler(skipButtons.onNext) && typeof skipButtons.setForwardHandler === "function") {
      skipButtons.setForwardHandler(originalForwardHandler || undefined);
    }

    if (isQueueHandler(skipButtons.onPrevious) && typeof skipButtons.setBackwardHandler === "function") {
      skipButtons.setBackwardHandler(originalBackwardHandler || undefined);
    }
  }

  function configurePlayerQueueControls(player) {
    if (!isScenePlayerRoute() || !isUsablePlayer(player) || typeof player.skipButtons !== "function") {
      return;
    }

    var skipButtons = player.skipButtons();
    if (!skipButtons) {
      return;
    }

    if (queueControlsPlayer && queueControlsPlayer !== player) {
      restorePlayerQueueControls(queueControlsPlayer);
      originalForwardHandler = null;
      originalBackwardHandler = null;
    }

    queueControlsPlayer = player;

    if (getQueue().length === 0) {
      skipButtons.setForwardHandler(undefined);
      skipButtons.setBackwardHandler(undefined);
      originalForwardHandler = null;
      originalBackwardHandler = null;
      return;
    }

    if (!isQueueHandler(skipButtons.onNext)) {
      originalForwardHandler = skipButtons.onNext || null;
    }

    if (!isQueueHandler(skipButtons.onPrevious)) {
      originalBackwardHandler = skipButtons.onPrevious || null;
    }

    if (typeof skipButtons.setForwardHandler === "function") {
      skipButtons.setForwardHandler(nextQueuedSceneID() ? queueNextHandler : undefined);
    }

    if (typeof skipButtons.setBackwardHandler === "function") {
      skipButtons.setBackwardHandler(previousQueuedSceneID() ? queuePreviousHandler : undefined);
    }
  }

  function attachPlayerListener() {
    var player = getCurrentPlayer();
    if (!isUsablePlayer(player)) player = null;

    configurePlayerQueueControls(player);
    restoreFullscreenIfNeeded();
  }

  function schedulePlayerAttachment() {
    [0, 50, 150, 350, 700].forEach(function (delay) {
      window.setTimeout(attachPlayerListener, delay);
    });
  }

  function extractSceneID(element) {
    var links = [];
    if (element.matches && element.matches("a[href]")) {
      links.push(element);
    }
    links = links.concat(Array.prototype.slice.call(element.querySelectorAll("a[href]")));

    for (var i = 0; i < links.length; i += 1) {
      var href = links[i].getAttribute("href") || "";
      var match = href.match(/\/scenes\/(\d+)/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  function thumbnailHostFor(element) {
    if (element.querySelector("." + addButtonClass)) {
      return null;
    }

    if (element.classList.contains("wall-item")) {
      return element;
    }

    return element.querySelector(".thumbnail-section, .video-section, .scene-card-preview") || element;
  }

  function addThumbnailButton(container) {
    var sceneID = extractSceneID(container);
    var host = sceneID ? thumbnailHostFor(container) : null;

    if (!sceneID || !host || host.querySelector(":scope > ." + addButtonClass)) {
      return;
    }

    host.classList.add("stash-session-queue-thumbnail-host");

    var button = document.createElement("button");
    button.type = "button";
    button.className = addButtonClass;
    button.title = "Add to queue";
    button.setAttribute("aria-label", "Add to queue");
    button.innerHTML = icons.list;
    button.addEventListener("mousedown", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      addToQueue(sceneID);
      schedulePanelRender();
    });

    host.appendChild(button);
  }

  function enhanceThumbnails() {
    scheduledEnhance = false;
    document.querySelectorAll(".scene-card, .wall-item").forEach(addThumbnailButton);
    attachPlayerListener();
  }

  function scheduleEnhanceThumbnails() {
    if (scheduledEnhance) {
      return;
    }

    scheduledEnhance = true;
    window.requestAnimationFrame(enhanceThumbnails);
  }

  function button(title, icon, onClick, options) {
    var el = document.createElement("button");
    var opts = options || {};
    el.type = "button";
    el.title = title;
    el.setAttribute("aria-label", title);
    if (opts.className) {
      el.className = opts.className;
    }
    if (typeof opts.pressed === "boolean") {
      el.setAttribute("aria-pressed", String(opts.pressed));
    }
    el.disabled = !!opts.disabled;
    el.innerHTML = icon;
    el.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return el;
  }

  function createPanel() {
    var existing = document.getElementById(panelID);
    if (existing) {
      return existing;
    }

    var panel = document.createElement("section");
    panel.id = panelID;
    panel.className = "stash-session-queue-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Session scene queue");
    document.body.appendChild(panel);
    return panel;
  }

  function preferenceOptionsControl() {
    var details = document.createElement("details");
    details.className = "stash-session-queue-preference-options";
    var summary = document.createElement("summary");
    summary.title = "Preference-aware shuffle options";
    summary.setAttribute("aria-label", "Preference-aware shuffle options");
    summary.innerHTML = icons.preferences;
    details.appendChild(summary);
    var menu = document.createElement("div");
    menu.className = "stash-session-queue-preference-menu";

    function checkbox(label, key) {
      var wrapper = document.createElement("label");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!nextShuffleOptions[key];
      input.addEventListener("change", function () { nextShuffleOptions[key] = input.checked; });
      wrapper.appendChild(input);
      wrapper.appendChild(document.createTextNode(" " + label));
      return wrapper;
    }

    menu.appendChild(checkbox("Ignore Preference Weights", "ignorePreferenceWeights"));
    menu.appendChild(checkbox("Include Shuffle-Excluded Scenes", "includeExcluded"));
    var regenerate = document.createElement("button");
    regenerate.type = "button";
    regenerate.textContent = "Regenerate Shuffle Order";
    regenerate.disabled = shuffleBusy || !isShuffleEnabled();
    regenerate.addEventListener("click", function () {
      regenerateShuffleOrder(preferenceShuffleOptions()).catch(function (error) { console.warn("[Session Scene Queue]", error); });
      details.open = false;
    });
    menu.appendChild(regenerate);
    var defaults = document.createElement("button");
    defaults.type = "button";
    defaults.textContent = "Reload Saved Defaults";
    defaults.addEventListener("click", function () { preferenceDefaultsLoaded = false; loadPreferenceDefaults(true); details.open = false; });
    menu.appendChild(defaults);
    var note = document.createElement("small");
    note.textContent = scenePreferencesAPI()
      ? "Options apply to the next generated order. Save defaults on the Preferences page."
      : "Scene Preferences is unavailable; shuffle remains uniform.";
    menu.appendChild(note);
    details.appendChild(menu);
    return details;
  }

  function renderPanel() {
    scheduledPanel = false;

    var panel = createPanel();
    var ids = getQueueDisplayOrder();
    panel.hidden = ids.length === 0 || isScenePlayerRoute();

    if (ids.length === 0) {
      panel.replaceChildren();
      return;
    }

    var header = document.createElement("div");
    header.className = "stash-session-queue-header";

    header.appendChild(button("Play queue", icons.play, playQueue));

    var title = document.createElement("div");
    title.className = "stash-session-queue-title";
    title.textContent = "Queue (" + ids.length + ")";
    header.appendChild(title);

    var actions = document.createElement("div");
    actions.className = "stash-session-queue-actions";
    actions.appendChild(button(isShuffleEnabled() ? "Turn shuffle off" : "Turn shuffle on", icons.shuffle, toggleShuffle, {
      className: isShuffleEnabled() ? "is-active" : "",
      pressed: isShuffleEnabled(),
      disabled: shuffleBusy
    }));
    actions.appendChild(preferenceOptionsControl());
    actions.appendChild(button("Saved Queues", icons.list, function () { navigateWithinStash("/plugins/saved-scene-queues"); }));
    actions.appendChild(button("Clear queue", icons.trash, clearQueue));
    actions.appendChild(button(collapsed ? "Expand queue" : "Collapse queue", collapsed ? icons.up : icons.down, function () {
      collapsed = !collapsed;
      schedulePanelRender();
    }));
    header.appendChild(actions);

    var body = document.createElement("div");
    body.className = "stash-session-queue-body";

    if (nativeQueueStatus || shuffleStatus) {
      var preferenceStatus = document.createElement("div");
      preferenceStatus.className = "stash-session-queue-preference-status";
      preferenceStatus.textContent = nativeQueueStatus || shuffleStatus;
      body.appendChild(preferenceStatus);
    }

    if (!collapsed) {
      var loadedScenes = ids
        .map(function (id) {
          return sceneCache.get(id);
        })
        .filter(Boolean);

      if (loadedScenes.length === 0 && loadingScenes) {
        var loading = document.createElement("div");
        loading.className = "stash-session-queue-empty";
        loading.textContent = "Loading...";
        body.appendChild(loading);
      } else {
        var list = document.createElement("ol");
        list.className = "stash-session-queue-list";
        var playableIDs = new Set(getPlaybackOrder());
        ids.slice(0, floatingVisibleCount).forEach(function (id, index) {
          list.appendChild(renderQueueEntry(id, sceneCache.get(id), index, playableIDs.has(id)));
        });
        body.appendChild(list);
        if (ids.length > floatingVisibleCount) {
          var more = document.createElement("button");
          more.type = "button";
          more.className = "stash-session-queue-load-more";
          more.textContent = "Show 100 more (" + (ids.length - floatingVisibleCount) + " remaining)";
          more.addEventListener("click", function () {
            floatingVisibleCount += 100;
            schedulePanelRender();
          });
          body.appendChild(more);
        }
      }
    }

    panel.replaceChildren(header, body);
  }

  function schedulePanelRender() {
    if (scheduledPanel) {
      return;
    }

    scheduledPanel = true;
    window.requestAnimationFrame(renderPanel);
  }

  function renderQueueEntry(id, scene, index, playable) {
    var item = document.createElement("li");
    item.className = "stash-session-queue-entry";
    item.draggable = playable;
    item.dataset.sceneId = id;

    item.addEventListener("dragstart", function (event) {
      dragFromIndex = index;
      item.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    });
    item.addEventListener("dragend", function () {
      dragFromIndex = null;
      item.classList.remove("is-dragging");
    });
    item.addEventListener("dragover", function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("drop", function (event) {
      event.preventDefault();
      if (dragFromIndex !== null) {
        moveDisplayedQueueItem(dragFromIndex, index);
      }
      dragFromIndex = null;
    });

    var grip = document.createElement("span");
    grip.className = "stash-session-queue-grip";
    grip.innerHTML = icons.grip;
    item.appendChild(grip);

    var image = document.createElement("img");
    image.className = "stash-session-queue-thumb";
    image.loading = "lazy";
    image.alt = scene ? sceneTitle(scene, id) : "";
    image.src = scene && scene.paths && scene.paths.screenshot ? scene.paths.screenshot : "";
    item.appendChild(image);

    var text = document.createElement("div");
    text.className = "stash-session-queue-text";

    var primary = document.createElement("span");
    primary.textContent = scene ? sceneTitle(scene, id) : "Scene " + id;
    text.appendChild(primary);

    var secondary = document.createElement("small");
    secondary.textContent = !playable ? "Excluded from shuffle" : scene ? sceneSummary(scene) : "Loading...";
    text.appendChild(secondary);
    item.appendChild(text);

    item.appendChild(button("Remove from queue", icons.close, function () {
      removeFromQueue(id);
    }));

    return item;
  }

  function fileNameFromPath(path) {
    if (!path) {
      return "";
    }

    return String(path).replace(/^.*[\\/]/, "");
  }

  function sceneTitle(scene, id) {
    var title = scene.title ? String(scene.title).trim() : "";
    if (title) {
      return title;
    }

    if (scene.files && scene.files.length > 0) {
      return fileNameFromPath(scene.files[0].path) || scene.files[0].basename || "Scene " + id;
    }

    return "Scene " + id;
  }

  function sceneSummary(scene) {
    if (scene.studio && scene.studio.name) {
      return scene.studio.name;
    }

    if (scene.performers && scene.performers.length > 0) {
      return scene.performers.map(function (performer) {
        return performer.name;
      }).join(", ");
    }

    return scene.date || "";
  }

  function loadQueuedScenes() {
    var missingIDs = getQueue().filter(function (id) {
      return !sceneCache.has(id);
    });

    if (missingIDs.length === 0 || loadingScenes) {
      schedulePanelRender();
      return;
    }

    loadingScenes = true;
    schedulePanelRender();

    fetch(graphQLURL(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        query: "query SessionSceneQueue($scene_ids: [Int!]) { findScenes(scene_ids: $scene_ids) { scenes { id title date paths { screenshot } studio { id name } performers { id name } files { path basename } } } }",
        variables: {
          scene_ids: missingIDs.map(function (id) {
            return Number(id);
          })
        }
      })
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Scene queue request failed");
        }
        return response.json();
      })
      .then(function (payload) {
        var scenes = payload && payload.data && payload.data.findScenes
          ? payload.data.findScenes.scenes || []
          : [];
        scenes.forEach(function (scene) {
          sceneCache.set(String(scene.id), scene);
        });
      })
      .catch(function (err) {
        console.warn("[Session Scene Queue]", err);
      })
      .finally(function () {
        loadingScenes = false;
        schedulePanelRender();
        window.dispatchEvent(new Event(sceneCacheChangedEvent));
      });
  }

  function onQueueChanged() {
    loadQueuedScenes();
    schedulePanelRender();
    schedulePlayerAttachment();
  }

  function graphqlRequest(query, variables) {
    return fetch(graphQLURL(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        query: query,
        variables: variables || {}
      })
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Stash request failed");
        }
        return response.json();
      })
      .then(function (payload) {
        if (payload.errors && payload.errors.length) {
          throw new Error(payload.errors.map(function (error) {
            return error.message;
          }).join("; "));
        }
        return payload.data;
      });
  }

  function queueIconElement(React, icon, className) {
    return React.createElement("span", {
      className: className || "stash-session-queue-control-icon",
      dangerouslySetInnerHTML: { __html: icon }
    });
  }

  function SessionQueuePlayerView() {
    var React = window.PluginApi.React;
    var h = React.createElement;
    var revisionState = React.useState(0);
    var setRevision = revisionState[1];
    var optionsState = React.useState(function () { return Object.assign({}, nextShuffleOptions); });
    var localOptions = optionsState[0];
    var setLocalOptions = optionsState[1];
    var dragIndex = React.useRef(null);
    var listRef = React.useRef(null);
    var initialIDs = getQueueDisplayOrder();
    var initialCurrentIndex = initialIDs.indexOf(currentSceneID());
    var rangeState = React.useState(function () {
      var start = initialCurrentIndex > 20 ? initialCurrentIndex - 20 : 0;
      return { start: start, end: Math.min(initialIDs.length, start + 120) };
    });
    var visibleRange = rangeState[0];
    var setVisibleRange = rangeState[1];

    React.useEffect(function () {
      function refresh() {
        setRevision(function (value) { return value + 1; });
      }
      window.addEventListener(queueChangedEvent, refresh);
      window.addEventListener(sceneCacheChangedEvent, refresh);
      window.addEventListener("popstate", refresh);
      loadQueuedScenes();

      return function () {
        window.removeEventListener(queueChangedEvent, refresh);
        window.removeEventListener(sceneCacheChangedEvent, refresh);
        window.removeEventListener("popstate", refresh);
      };
    }, []);

    var ids = getQueueDisplayOrder();
    var playableIDs = new Set(getPlaybackOrder());
    var current = currentSceneID();
    var previous = previousQueuedSceneID();
    var next = nextQueuedSceneID();
    var currentIndex = ids.indexOf(current);
    var rangeStart = Math.min(visibleRange.start, Math.max(0, ids.length - 1));
    var rangeEnd = Math.min(ids.length, Math.max(visibleRange.end, rangeStart + 1));
    var visibleIDs = ids.slice(rangeStart, rangeEnd);

    React.useEffect(function () {
      if (currentIndex >= 0 && (currentIndex < rangeStart || currentIndex >= rangeEnd)) {
        var start = currentIndex > 20 ? currentIndex - 20 : 0;
        setVisibleRange({ start: start, end: Math.min(ids.length, start + 120) });
      }
    }, [current, currentIndex, ids.length, rangeStart, rangeEnd]);

    React.useLayoutEffect(function () {
      var list = listRef.current;
      if (!list) return;
      function align() { alignCurrentQueueEntry(list); }
      align();
      // Tabs can mount while hidden. Align once they become visible or resize.
      var observer = window.ResizeObserver ? new window.ResizeObserver(align) : null;
      if (observer) observer.observe(list);
      return function () { if (observer) observer.disconnect(); };
    }, [current, ids.join(","), rangeStart, rangeEnd]);

    function control(title, icon, handler, options) {
      var opts = options || {};
      return h("button", {
        type: "button",
        className: "stash-session-queue-player-control" + (opts.active ? " is-active" : ""),
        title: title,
        "aria-label": title,
        "aria-pressed": opts.pressed === undefined ? undefined : String(opts.pressed),
        disabled: !!opts.disabled,
        onClick: handler
      }, queueIconElement(React, icon));
    }

    function setOption(key, checked) {
      var updated = Object.assign({}, localOptions);
      updated[key] = checked;
      nextShuffleOptions = preferenceShuffleOptions(updated);
      setLocalOptions(updated);
    }

    function renderEntry(id, index) {
      var scene = sceneCache.get(id);
      return h("li", {
        className: "stash-session-queue-entry" + (id === current ? " is-current" : ""),
        draggable: playableIDs.has(id),
        key: id,
        "data-scene-id": id,
        "aria-current": id === current ? "true" : undefined,
        onDragStart: function (event) {
          dragIndex.current = index;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", id);
        },
        onDragEnd: function () { dragIndex.current = null; },
        onDragOver: function (event) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        },
        onDrop: function (event) {
          event.preventDefault();
          if (dragIndex.current !== null) moveDisplayedQueueItem(dragIndex.current, index);
          dragIndex.current = null;
        }
      },
        h("span", {
          className: "stash-session-queue-grip",
          dangerouslySetInnerHTML: { __html: icons.grip }
        }),
        h("button", {
          type: "button",
          className: "stash-session-queue-entry-main",
          title: "Play " + (scene ? sceneTitle(scene, id) : "scene " + id),
          onClick: function () { navigateToScene(id); }
        },
          h("img", {
            className: "stash-session-queue-thumb",
            loading: "lazy",
            alt: scene ? sceneTitle(scene, id) : "",
            src: scene && scene.paths && scene.paths.screenshot ? scene.paths.screenshot : ""
          }),
          h("span", { className: "stash-session-queue-text" },
            h("span", null, scene ? sceneTitle(scene, id) : "Scene " + id),
            h("small", null, !playableIDs.has(id) ? "Excluded from shuffle" : scene ? sceneSummary(scene) : "Loading...")
          )
        ),
        control("Remove from queue", icons.close, function () { removeFromQueue(id); })
      );
    }

    return h("div", { className: "stash-session-queue-player-view" },
      h("div", { className: "stash-session-queue-player-header" },
        h("div", { className: "stash-session-queue-player-title" }, "Queue (" + ids.length + ")"),
        h("div", { className: "stash-session-queue-player-controls" },
          control("Saved Queues", icons.list, function () { navigateWithinStash("/plugins/saved-scene-queues"); }),
          control("Previous scene", icons.previous, queuePreviousHandler, { disabled: !previous }),
          control("Play queue", icons.play, playQueue, { disabled: ids.length === 0 }),
          control("Next scene", icons.next, queueNextHandler, { disabled: !next }),
          control(isShuffleEnabled() ? "Turn shuffle off" : "Turn shuffle on", icons.shuffle, toggleShuffle, {
            active: isShuffleEnabled(),
            pressed: isShuffleEnabled(),
            disabled: shuffleBusy || ids.length === 0
          }),
          h("details", { className: "stash-session-queue-preference-options" },
            h("summary", { title: "Preference-aware shuffle options", "aria-label": "Preference-aware shuffle options" }, queueIconElement(React, icons.preferences)),
            h("div", { className: "stash-session-queue-preference-menu" },
              h("label", null,
                h("input", {
                  type: "checkbox",
                  checked: !!localOptions.ignorePreferenceWeights,
                  onChange: function (event) { setOption("ignorePreferenceWeights", event.target.checked); }
                }),
                " Ignore Preference Weights"
              ),
              h("label", null,
                h("input", {
                  type: "checkbox",
                  checked: !!localOptions.includeExcluded,
                  onChange: function (event) { setOption("includeExcluded", event.target.checked); }
                }),
                " Include Shuffle-Excluded Scenes"
              ),
              h("button", {
                type: "button",
                disabled: shuffleBusy || !isShuffleEnabled(),
                onClick: function () { regenerateShuffleOrder(preferenceShuffleOptions(localOptions)).catch(function () {}); }
              }, "Regenerate Shuffle Order")
            )
          ),
          control("Clear queue", icons.trash, clearQueue, { disabled: ids.length === 0 })
        )
      ),
      (nativeQueueStatus || shuffleStatus) && h("div", { className: "stash-session-queue-preference-status" }, nativeQueueStatus || shuffleStatus),
      ids.length === 0
        ? h("div", { className: "stash-session-queue-empty" }, "The playback queue is empty.")
        : h(React.Fragment, null,
            h("div", { className: "stash-session-queue-window-controls" },
              h("button", {
                type: "button",
                disabled: rangeStart === 0,
                onClick: function () {
                  setVisibleRange({ start: Math.max(0, rangeStart - 100), end: rangeEnd });
                }
              }, "Show previous"),
              h("span", null, "Showing " + (rangeStart + 1) + "-" + rangeEnd + " of " + ids.length),
              h("button", {
                type: "button",
                disabled: rangeEnd >= ids.length,
                onClick: function () {
                  setVisibleRange({ start: rangeStart, end: Math.min(ids.length, rangeEnd + 100) });
                }
              }, "Show more")
            ),
            h("ol", { ref: listRef, className: "stash-session-queue-list stash-session-queue-player-list", start: rangeStart + 1 }, visibleIDs.map(function (id, index) {
              return renderEntry(id, rangeStart + index);
            }))
          )
    );
  }

  function elementHasEventKey(React, element, eventKey) {
    if (!React.isValidElement(element)) return false;
    if (element.props && element.props.eventKey === eventKey) return true;
    return React.Children.toArray(element.props && element.props.children).some(function (child) {
      return elementHasEventKey(React, child, eventKey);
    });
  }

  function registerQueueOwnershipPatches() {
    var pluginApi = window.PluginApi;
    if (!pluginApi || !pluginApi.React || !pluginApi.patch || window.__stashSessionQueueOwnershipRegistered) return;
    window.__stashSessionQueueOwnershipRegistered = true;
    var React = pluginApi.React;
    var h = React.createElement;
    var Bootstrap = pluginApi.libraries && pluginApi.libraries.Bootstrap;

    // Let Stash own shortcut binding/cleanup; its ScenePage effect rebinds on
    // every render, so a competing child effect cannot reliably own these keys.
    pluginApi.patch.before("ScenePage", patchSceneQueueCallbacks);
    pluginApi.patch.before("ScenePlayer", patchScenePlayerCallbacks);

    pluginApi.patch.before("SceneList", function (props) {
      rememberNativeQueueContext(props);
      return [props];
    });

    if (!Bootstrap || !Bootstrap.Nav || !Bootstrap.Tab) return;

    pluginApi.patch.before("ScenePage.Tabs", function (props) {
      var children = React.Children.toArray(props.children).filter(function (child) {
        return !elementHasEventKey(React, child, "scene-queue-panel");
      });
      children.splice(1, 0, h(Bootstrap.Nav.Item, { key: "stash-session-queue-tab" },
        h(Bootstrap.Nav.Link, { eventKey: "scene-queue-panel" }, "Queue")
      ));
      return [Object.assign({}, props, { children: children })];
    });

    pluginApi.patch.before("ScenePage.TabContent", function (props) {
      var children = React.Children.toArray(props.children).filter(function (child) {
        return !elementHasEventKey(React, child, "scene-queue-panel");
      });
      children.splice(1, 0, h(Bootstrap.Tab.Pane, {
        eventKey: "scene-queue-panel",
        key: "stash-session-queue-content"
      }, h(SessionQueuePlayerView)));
      return [Object.assign({}, props, { children: children })];
    });
  }

  var builderRoute = "/plugins/session-queue-builder";
  var builderCategories = [
    {
      key: "characters",
      title: "Characters",
      parentNames: ["characters", "character"]
    },
    {
      key: "franchises",
      title: "Franchises",
      parentNames: ["franchises", "franchise", "series", "sources", "source"]
    },
    {
      key: "authors",
      title: "Authors",
      parentNames: ["authors", "author", "artists", "artist", "creators", "creator"]
    }
  ];

  function tagSort(a, b) {
    return String(a.name).localeCompare(String(b.name), undefined, {
      sensitivity: "base"
    });
  }

  function categoryOptions(tags, category) {
    var parentIDs = new Set(tags.filter(function (tag) {
      return category.parentNames.indexOf(String(tag.name || "").toLowerCase()) !== -1;
    }).map(function (tag) {
      return String(tag.id);
    }));

    var children = tags.filter(function (tag) {
      return tag.parents && tag.parents.some(function (parent) {
        return parentIDs.has(String(parent.id));
      });
    });

    if (children.length > 0) {
      return {
        tags: children.slice().sort(tagSort),
        scoped: true
      };
    }

    return {
      tags: tags.filter(function (tag) {
        return Number(tag.scene_count || 0) > 0;
      }).slice().sort(tagSort),
      scoped: false
    };
  }

  function makeCategoryFilter(ids, includeDescendants) {
    return {
      tags: {
        value: ids,
        modifier: "INCLUDES",
        depth: includeDescendants ? 1 : 0
      }
    };
  }

  function andSceneFilters(filters) {
    return filters.reduce(function (combined, filter) {
      if (!combined) {
        return filter;
      }
      return {
        AND: combined,
        tags: filter.tags
      };
    }, null);
  }

  function builderSceneFilter(selected, matchMode, includeDescendants) {
    var selectedGroups = builderCategories.map(function (category) {
      return normaliseSceneIDs(selected[category.key] || []);
    }).filter(function (ids) {
      return ids.length > 0;
    });

    if (selectedGroups.length === 0) {
      return null;
    }

    if (matchMode === "all") {
      return andSceneFilters(selectedGroups.map(function (ids) {
        return makeCategoryFilter(ids, includeDescendants);
      }));
    }

    return makeCategoryFilter(normaliseSceneIDs([].concat.apply([], selectedGroups)), includeDescendants);
  }

  function fetchBuilderSceneCount(sceneFilter) {
    return graphqlRequest(
      "query SessionQueueBuilderCount($filter: FindFilterType, $scene_filter: SceneFilterType) { findScenes(filter: $filter, scene_filter: $scene_filter) { count } }",
      {
        filter: {
          per_page: 1
        },
        scene_filter: sceneFilter
      }
    ).then(function (data) {
      return data.findScenes.count;
    });
  }

  function fetchBuilderSceneIDs(sceneFilter, onProgress) {
    var perPage = 500;
    return fetchBuilderSceneCount(sceneFilter).then(function (count) {
      var ids = [];
      var pages = Math.max(1, Math.ceil(count / perPage));
      var chain = Promise.resolve();

      for (var page = 1; page <= pages; page += 1) {
        (function (currentPage) {
          chain = chain.then(function () {
            if (typeof onProgress === "function") {
              onProgress(ids.length, count);
            }

            return graphqlRequest(
              "query SessionQueueBuilderScenes($filter: FindFilterType, $scene_filter: SceneFilterType) { findScenes(filter: $filter, scene_filter: $scene_filter) { scenes { id } } }",
              {
                filter: {
                  page: currentPage,
                  per_page: perPage,
                  sort: "created_at",
                  direction: "DESC"
                },
                scene_filter: sceneFilter
              }
            ).then(function (data) {
              ids = ids.concat((data.findScenes.scenes || []).map(function (scene) {
                return String(scene.id);
              }));
            });
          });
        })(page);
      }

      return chain.then(function () {
        if (typeof onProgress === "function") {
          onProgress(ids.length, count);
        }
        return ids;
      });
    });
  }

  function registerQueueBuilderPage() {
    var pluginApi = window.PluginApi;
    if (!pluginApi || !pluginApi.React || !pluginApi.register || !pluginApi.register.route) {
      return;
    }

    if (window.__stashSessionQueueBuilderRegistered) {
      return;
    }
    window.__stashSessionQueueBuilderRegistered = true;

    var React = pluginApi.React;
    var h = React.createElement;

    function selectedCount(selected) {
      return builderCategories.reduce(function (total, category) {
        return total + ((selected[category.key] || []).length);
      }, 0);
    }

    function toggleSelection(selected, key, id) {
      var existing = selected[key] || [];
      var next = existing.indexOf(id) === -1
        ? existing.concat([id])
        : existing.filter(function (selectedID) {
          return selectedID !== id;
        });

      var ret = Object.assign({}, selected);
      ret[key] = next;
      return ret;
    }

    function TagPicker(props) {
      var searchState = React.useState("");
      var search = searchState[0];
      var setSearch = searchState[1];
      var selectedSet = new Set(props.selectedIDs);
      var lowerSearch = search.trim().toLowerCase();
      var filtered = props.tags.filter(function (tag) {
        return !lowerSearch || String(tag.name).toLowerCase().indexOf(lowerSearch) !== -1;
      }).slice(0, 120);
      var selectedTags = props.tags.filter(function (tag) {
        return selectedSet.has(String(tag.id));
      });

      return h("section", { className: "stash-session-queue-builder-picker" },
        h("div", { className: "stash-session-queue-builder-picker-head" },
          h("div", null,
            h("h3", null, props.title),
            h("small", null, props.scoped ? "Category tags" : "All scene tags")
          ),
          h("button", {
            type: "button",
            disabled: props.selectedIDs.length === 0,
            onClick: function () { props.onClear(); }
          }, "Clear")
        ),
        h("input", {
          className: "stash-session-queue-builder-search",
          type: "search",
          placeholder: "Search " + props.title.toLowerCase(),
          value: search,
          onChange: function (event) { setSearch(event.target.value); }
        }),
        selectedTags.length > 0 && h("div", { className: "stash-session-queue-builder-chips" },
          selectedTags.map(function (tag) {
            return h("button", {
              key: tag.id,
              type: "button",
              onClick: function () { props.onToggle(String(tag.id)); }
            }, tag.name);
          })
        ),
        h("div", { className: "stash-session-queue-builder-tag-list" },
          filtered.map(function (tag) {
            var selected = selectedSet.has(String(tag.id));
            return h("button", {
              key: tag.id,
              type: "button",
              className: selected ? "is-selected" : "",
              onClick: function () { props.onToggle(String(tag.id)); }
            },
              h("span", null, tag.name),
              h("small", null, String(tag.scene_count || 0))
            );
          })
        )
      );
    }

    function QueueBuilderPage() {
      var tagState = React.useState([]);
      var tags = tagState[0];
      var setTags = tagState[1];
      var loadingState = React.useState(true);
      var loading = loadingState[0];
      var setLoading = loadingState[1];
      var errorState = React.useState("");
      var error = errorState[0];
      var setError = errorState[1];
      var selectedState = React.useState({
        characters: [],
        franchises: [],
        authors: []
      });
      var selected = selectedState[0];
      var setSelected = selectedState[1];
      var matchModeState = React.useState("any");
      var matchMode = matchModeState[0];
      var setMatchMode = matchModeState[1];
      var includeDescendantsState = React.useState(true);
      var includeDescendants = includeDescendantsState[0];
      var setIncludeDescendants = includeDescendantsState[1];
      var replaceQueueState = React.useState(true);
      var replaceQueue = replaceQueueState[0];
      var setReplaceQueue = replaceQueueState[1];
      var startPlaybackState = React.useState(false);
      var startPlayback = startPlaybackState[0];
      var setStartPlayback = startPlaybackState[1];
      var shuffleModeState = React.useState(false);
      var shuffleMode = shuffleModeState[0];
      var setShuffleMode = shuffleModeState[1];
      var ignoreWeightsState = React.useState(false);
      var ignoreWeights = ignoreWeightsState[0];
      var setIgnoreWeights = ignoreWeightsState[1];
      var includeExcludedState = React.useState(false);
      var includeExcluded = includeExcludedState[0];
      var setIncludeExcluded = includeExcludedState[1];
      var preferencesAvailableState = React.useState(!!scenePreferencesAPI());
      var preferencesAvailable = preferencesAvailableState[0];
      var setPreferencesAvailable = preferencesAvailableState[1];
      var limitState = React.useState("");
      var limit = limitState[0];
      var setLimit = limitState[1];
      var statusState = React.useState("");
      var status = statusState[0];
      var setStatus = statusState[1];
      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var matchedState = React.useState(null);
      var matched = matchedState[0];
      var setMatched = matchedState[1];

      React.useEffect(function () {
        setLoading(true);
        graphqlRequest(
          "query SessionQueueBuilderTags($filter: FindFilterType) { findTags(filter: $filter) { tags { id name scene_count parents { id name } child_count } } }",
          {
            filter: {
              per_page: -1,
              sort: "name"
            }
          }
        ).then(function (data) {
          setTags((data.findTags.tags || []).map(function (tag) {
            return Object.assign({}, tag, {
              id: String(tag.id)
            });
          }));
          setError("");
        }).catch(function (err) {
          setError(err.message || String(err));
        }).finally(function () {
          setLoading(false);
        });
      }, []);

      React.useEffect(function () {
        var api = scenePreferencesAPI();
        setPreferencesAvailable(!!api);
        if (!api || typeof api.getConfig !== "function") return;
        api.getConfig({ fresh: true }).then(function (config) {
          setIgnoreWeights(!!config.defaultIgnorePreferenceWeights);
          setIncludeExcluded(!!config.defaultIncludeExcluded);
        }).catch(function () {});
      }, []);

      var categoryData = React.useMemo(function () {
        var ret = {};
        builderCategories.forEach(function (category) {
          ret[category.key] = categoryOptions(tags, category);
        });
        return ret;
      }, [tags]);

      var sceneFilter = React.useMemo(function () {
        return builderSceneFilter(selected, matchMode, includeDescendants);
      }, [selected, matchMode, includeDescendants]);

      function toggleTag(key, id) {
        setSelected(function (current) {
          return toggleSelection(current, key, id);
        });
        setMatched(null);
        setStatus("");
      }

      function clearCategory(key) {
        setSelected(function (current) {
          var ret = Object.assign({}, current);
          ret[key] = [];
          return ret;
        });
        setMatched(null);
      }

      function previewCount() {
        setBusy(true);
        setStatus("Counting matches...");
        setError("");
        fetchBuilderSceneCount(sceneFilter).then(function (count) {
          setMatched(count);
          setStatus(String(count) + " matching scenes");
        }).catch(function (err) {
          setError(err.message || String(err));
        }).finally(function () {
          setBusy(false);
        });
      }

      function buildQueue() {
        var max = Number.parseInt(limit, 10);
        var generation = generationID("targeted");
        setBusy(true);
        setError("");
        setStatus("Fetching scenes...");

        fetchBuilderSceneIDs(sceneFilter, function (loaded, total) {
          setStatus("Fetched " + String(loaded) + " of " + String(total) + " scenes...");
        }).then(function (ids) {
          var normalized = normaliseSceneIDs(ids);
          var api = scenePreferencesAPI();
          var generated = api
            ? api.generateShuffle(normalized, {
              limit: Number.isFinite(max) && max > 0 ? max : null,
              ignorePreferenceWeights: !!ignoreWeights,
              includeExcluded: !!includeExcluded,
              source: "session-queue-targeted"
            })
            : Promise.resolve({
              sceneIDs: (Number.isFinite(max) && max > 0 ? shuffleSceneIDs(normalized).slice(0, max) : shuffleSceneIDs(normalized)),
              excludedSceneIDs: [], preferenceAware: false
            });
          setStatus(api ? "Calculating preference-aware weights..." : "Scene Preferences unavailable; using uniform shuffle...");
          return generated.then(function (result) {
            var shuffled = normaliseSceneIDs(result.sceneIDs || []);
            if (!shuffled.length) throw new Error("No eligible scenes remain. Restore an excluded scene or enable Include Shuffle-Excluded Scenes.");
            var recordedIDs;
            if (replaceQueue) {
              setShuffleState(false);
              setQueue(shuffled);
              recordedIDs = shuffled;
            } else {
              recordedIDs = addManyToQueue(shuffled).addedSceneIDs;
            }
            var modePromise = shuffleMode
              ? setShuffleEnabled(true, { ignorePreferenceWeights: !!ignoreWeights, includeExcluded: !!includeExcluded })
              : setShuffleEnabled(false);
            return modePromise.then(function () {
              var recordPromise = api && recordedIDs.length && typeof api.recordShuffleExposure === "function"
                ? api.recordShuffleExposure(recordedIDs, { generationId: generation, source: "session-queue-targeted" })
                : Promise.resolve();
              return recordPromise.then(function () {
                setMatched(ids.length);
                setStatus("Queued " + String(shuffled.length) + (api ? " preference-aware" : " uniformly shuffled") + " scenes" +
                  (result.excludedSceneIDs && result.excludedSceneIDs.length ? "; skipped " + result.excludedSceneIDs.length + " excluded" : "") + ".");
                if (api && typeof api.getConfig === "function") api.getConfig({ fresh: false }).then(function (config) {
                  setIgnoreWeights(!!config.defaultIgnorePreferenceWeights);
                  setIncludeExcluded(!!config.defaultIncludeExcluded);
                }).catch(function () {});
                if (startPlayback) navigateToScene(shuffled[0]);
              });
            });
          });
        }).catch(function (err) {
          setError(err.message || String(err));
        }).finally(function () {
          setBusy(false);
        });
      }

      return h("div", { className: "stash-session-queue-builder-page" },
        h("div", { className: "stash-session-queue-builder-titlebar" },
          h("div", null,
            h("h1", null, "Targeted Shuffle Queue"),
            h("a", { href: "/plugins/saved-scene-queues" }, "Saved Queues"),
            h("p", null, "Build a randomized queue from library-wide scene matches.")
          ),
          h("button", {
            type: "button",
            onClick: function () {
              setSelected({ characters: [], franchises: [], authors: [] });
              setMatched(null);
              setStatus("");
            },
            disabled: selectedCount(selected) === 0 || busy
          }, "Reset")
        ),
        error && h("div", { className: "stash-session-queue-builder-alert" }, error),
        loading ? h("div", { className: "stash-session-queue-builder-loading" }, "Loading targets...") :
          h(React.Fragment, null,
            h("div", { className: "stash-session-queue-builder-grid" },
              builderCategories.map(function (category) {
                var data = categoryData[category.key] || { tags: [], scoped: false };
                return h(TagPicker, {
                  key: category.key,
                  title: category.title,
                  tags: data.tags,
                  scoped: data.scoped,
                  selectedIDs: selected[category.key] || [],
                  onToggle: function (id) { toggleTag(category.key, id); },
                  onClear: function () { clearCategory(category.key); }
                });
              })
            ),
            h("section", { className: "stash-session-queue-builder-controls" },
              h("div", { className: "stash-session-queue-builder-control-group" },
                h("span", null, "Match"),
                h("label", null,
                  h("input", {
                    type: "radio",
                    name: "queue-builder-match",
                    checked: matchMode === "any",
                    onChange: function () { setMatchMode("any"); setMatched(null); }
                  }),
                  "Any selected tag"
                ),
                h("label", null,
                  h("input", {
                    type: "radio",
                    name: "queue-builder-match",
                    checked: matchMode === "all",
                    onChange: function () { setMatchMode("all"); setMatched(null); }
                  }),
                  "One from each selected group"
                )
              ),
              h("div", { className: "stash-session-queue-builder-control-group" },
                h("span", null, "Queue"),
                h("label", null,
                  h("input", {
                    type: "checkbox",
                    checked: includeDescendants,
                    onChange: function (event) { setIncludeDescendants(event.target.checked); setMatched(null); }
                  }),
                  "Include child tags"
                ),
                h("label", null,
                  h("input", {
                    type: "checkbox",
                    checked: replaceQueue,
                    onChange: function (event) { setReplaceQueue(event.target.checked); }
                  }),
                  "Replace current queue"
                ),
                h("label", null,
                  h("input", {
                    type: "checkbox",
                    checked: shuffleMode,
                    onChange: function (event) { setShuffleMode(event.target.checked); }
                  }),
                  "Keep shuffle mode on"
                ),
                h("label", { title: preferencesAvailable ? "Use neutral vote multipliers while keeping recent-play and exposure balancing." : "Scene Preferences is not installed." },
                  h("input", {
                    type: "checkbox",
                    checked: ignoreWeights,
                    disabled: !preferencesAvailable,
                    onChange: function (event) { setIgnoreWeights(event.target.checked); }
                  }),
                  "Ignore Preference Weights"
                ),
                h("label", { title: preferencesAvailable ? "Allow scenes marked Excluded from Shuffle for this queue." : "Scene Preferences is not installed." },
                  h("input", {
                    type: "checkbox",
                    checked: includeExcluded,
                    disabled: !preferencesAvailable,
                    onChange: function (event) { setIncludeExcluded(event.target.checked); }
                  }),
                  "Include Shuffle-Excluded Scenes"
                ),
                h("label", null,
                  h("input", {
                    type: "checkbox",
                    checked: startPlayback,
                    onChange: function (event) { setStartPlayback(event.target.checked); }
                  }),
                  "Start playback"
                )
              ),
              h("label", { className: "stash-session-queue-builder-limit" },
                h("span", null, "Limit"),
                h("input", {
                  type: "number",
                  min: "1",
                  placeholder: "All",
                  value: limit,
                  onChange: function (event) { setLimit(event.target.value); }
                })
              ),
              h("div", { className: "stash-session-queue-builder-run" },
                h("button", {
                  type: "button",
                  disabled: busy,
                  onClick: previewCount
                }, "Count"),
                h("button", {
                  type: "button",
                  className: "primary",
                  disabled: busy,
                  onClick: buildQueue
                }, "Build Queue")
              )
            ),
            h("div", { className: "stash-session-queue-builder-status" },
              h("span", null, matched === null ? String(selectedCount(selected)) + " targets selected" : String(matched) + " matches"),
              status && h("small", null, status)
            )
          )
      );
    }

    pluginApi.register.route(builderRoute, QueueBuilderPage);

    if (pluginApi.patch && typeof pluginApi.patch.before === "function") {
      pluginApi.patch.before("MainNavBar.UtilityItems", function (props) {
        var NavLink = pluginApi.libraries && pluginApi.libraries.ReactRouterDOM
          ? pluginApi.libraries.ReactRouterDOM.NavLink
          : "a";
        var Button = pluginApi.libraries && pluginApi.libraries.Bootstrap
          ? pluginApi.libraries.Bootstrap.Button
          : "button";
        var linkProps = NavLink === "a"
          ? { className: "nav-utility", href: builderRoute }
          : { className: "nav-utility", exact: true, to: builderRoute };

        return [{
          children: h(React.Fragment, null,
            props.children,
            h(NavLink, linkProps,
              h(Button, {
                className: "minimal d-flex align-items-center h-100 stash-session-queue-builder-nav",
                title: "Targeted shuffle queue"
              },
                h("span", {
                  className: "stash-session-queue-builder-nav-icon",
                  dangerouslySetInnerHTML: { __html: icons.shuffle }
                })
              )
            )
          )
        }];
      });
    }
  }

  function exposeQueueApi() {
    window.StashSessionQueue = {
      version: "1.8.5",
      getSceneIDs: function () { return getQueue().slice(); },
      replace: function (sceneIDs) { return setQueue(normaliseSceneIDs(sceneIDs)).slice(); },
      add: function (sceneID) { return addManyToQueue([sceneID]); },
      addMany: function (sceneIDs) { return addManyToQueue(sceneIDs); },
      remove: function (sceneID) { removeFromQueue(sceneID); },
      clear: clearQueue,
      contains: function (sceneID) { return getQueue().indexOf(String(sceneID)) !== -1; },
      isShuffleEnabled: isShuffleEnabled,
      setShuffleEnabled: setShuffleEnabled,
      toggleShuffle: toggleShuffle,
      regenerateShuffleOrder: regenerateShuffleOrder,
      getShuffleOptions: function () { return Object.assign({}, nextShuffleOptions); },
      setNextShuffleOptions: function (options) { nextShuffleOptions = preferenceShuffleOptions(options); schedulePanelRender(); return Object.assign({}, nextShuffleOptions); }
    };
  }

  function onQueueAddRequest(event) {
    var detail = event && event.detail || {};
    addManyToQueue(detail.sceneIDs || detail.sceneIds || []);
  }

  function init() {
    exposeQueueApi();
    registerQueueOwnershipPatches();
    registerQueueBuilderPage();
    loadPreferenceDefaults(false);
    createPanel();
    scheduleEnhanceThumbnails();
    scheduleBrowseShuffleButton();
    onQueueChanged();
    importNativeQueueFromLocation(true);

    window.addEventListener(queueChangedEvent, onQueueChanged);
    window.addEventListener(queueAddRequestEvent, onQueueAddRequest);
    document.addEventListener("click", rememberNativeFilterQueueIntent, true);
    window.addEventListener("popstate", function () {
      importNativeQueueFromLocation();
      scheduleEnhanceThumbnails();
      scheduleBrowseShuffleButton();
      schedulePlayerAttachment();
      schedulePanelRender();
    });

    if (window.PluginApi && window.PluginApi.Event && typeof window.PluginApi.Event.addEventListener === "function") {
      window.PluginApi.Event.addEventListener("stash:location", function () {
        importNativeQueueFromLocation();
        scheduleEnhanceThumbnails();
        scheduleBrowseShuffleButton();
        schedulePlayerAttachment();
        scheduleFullscreenRestore();
        schedulePanelRender();
      });
    }

    var observer = new MutationObserver(function () {
      scheduleEnhanceThumbnails();
      scheduleBrowseShuffleButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.setInterval(attachPlayerListener, 1500);
  }

  if (window.__STASH_SESSION_QUEUE_TEST__) {
    window.StashSessionQueueTest = {
      normaliseSceneIDs: normaliseSceneIDs,
      getQueue: getQueue,
      clearQueue: clearQueue,
      importNativeQueueFromLocation: importNativeQueueFromLocation,
      setQueue: setQueue,
      addManyToQueue: addManyToQueue,
      moveQueueItem: moveQueueItem,
      patchSceneQueueCallbacks: patchSceneQueueCallbacks,
      patchScenePlayerCallbacks: patchScenePlayerCallbacks,
      restorePlayerQueueControls: restorePlayerQueueControls,
      configurePlayerQueueControls: configurePlayerQueueControls,
      nextQueuedSceneID: nextQueuedSceneID,
      previousQueuedSceneID: previousQueuedSceneID,
      getStoredSceneIDs: getStoredSceneIDs,
      isShuffleEnabled: isShuffleEnabled,
      shuffleSceneIDs: shuffleSceneIDs,
      makeShuffleOrder: makeShuffleOrder,
      generatePlaybackOrder: generatePlaybackOrder,
      setShuffleEnabled: setShuffleEnabled,
      regenerateShuffleOrder: regenerateShuffleOrder,
      getPlaybackOrder: getPlaybackOrder,
      getQueueDisplayOrder: getQueueDisplayOrder,
      moveDisplayedQueueItem: moveDisplayedQueueItem,
      alignCurrentQueueEntry: alignCurrentQueueEntry,
      preferenceShuffleOptions: preferenceShuffleOptions,
      isSceneBrowseRoute: isSceneBrowseRoute,
      isScenePlayerRoute: isScenePlayerRoute,
      nativeQueueContextKey: nativeQueueContextKey,
      parseNativeQueueDescriptor: parseNativeQueueDescriptor,
      decodeNativeSceneFilter: decodeNativeSceneFilter,
      cleanNativeQueueURL: cleanNativeQueueURL,
      markNativeFilterQueueIntent: markNativeFilterQueueIntent,
      shouldImportNativeFilterQueue: shouldImportNativeFilterQueue,
      contextFromNativeQueue: contextFromNativeQueue,
      contextFromSceneBrowseURL: contextFromSceneBrowseURL,
      resolveBrowseQueueContext: resolveBrowseQueueContext
    };
  }

  initializePlaybackSession();
  registerQueueOwnershipPatches();
  ready(init);
})();

