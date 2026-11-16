# Session Scene Queue

## Follow Playback (1.8.4)

The player queue highlights the current scene and aligns it with the top of the
visible list when playback advances, including the final scene. Played entries
remain above it and can be reached by scrolling up. The display follows the exact
playback order in shuffle mode; dragging updates that order without reshuffling.
Shuffle-excluded entries remain at the end, outside automatic playback.

## Player Queue Ownership (1.8.3)

The scene player uses the plugin queue directly for Next, Previous, and automatic
completion, including after refresh or React rerenders. Shuffle only chooses
among active queued IDs. At the end of the queue playback stops; stale completion
events cannot skip scenes or invoke the native queue. Embedded review players
retain their own navigation.

## Tab-Session Active Queue (1.8.5)

Each tab owns its active queue and shuffle order in sessionStorage at
`stash.tabScenePlayback.v1`. Refresh and in-app navigation retain them; a new,
copied, or restored tab starts empty. Only a reload retains document-start queue
state; other full document navigations reset it, including restored history.
The Stash server remaining running does not retain an active queue.

Old permanent active queues and legacy tab queues are discarded on upgrade.
Named Saved Queues remain separate and unchanged. Startup and history URLs never
create a queue, even with autoplay or native queue parameters. Native queue imports
require a fresh Play action. Thumbnail adds, targeted shuffle and explicit saved
queue loads continue to work. Pending imports cannot overwrite a later edit/clear.

## Saved Queues (1.8.0)

Open Saved Queues from the floating queue controls, player Queue tab or Targeted
Shuffle Queue page. Save current queue updates the selected saved list (or
creates one if none is selected). Save As creates another named list. Rename
changes only its name. Load / Replace Session Queue and Append are explicit
actions, never triggered by ordinary navigation. Delete removes only a saved
list. A saved list may be empty. Saving preserves the visible manual order,
not the separately generated shuffle order.

Browser localStorage key: stash.savedSceneQueues.v1. Envelope:
`{schemaVersion:1, queues:[{schemaVersion:1,type:"static",id,name,sceneIDs,
createdAt,updatedAt}]}`. sceneIDs are deduplicated in their original order;
timestamps are ISO 8601. Unknown schema versions or malformed records stop
writes and preserve the original blob. There is no legacy saved-list format to
migrate. Future dynamic types require an explicit schema migration. Browser
data clearing removes saved lists; they are local to this Stash origin/browser.

Loads validate existence through GraphQL in batches of 250, retain saved missing
IDs for diagnostics, and report skipped scenes. Failed validation or an entirely
missing saved list leaves the active session intact. If the session changes
while validation is running, loading is rejected instead of overwriting it.
Append deduplicates against the session. Existing shuffle reconciliation,
manual reorder, family additions, playback and import guards remain authoritative.

Public additions: StashSessionQueue.replace(sceneIDs), StashSavedQueues
{version,schemaVersion,route,list,save,rename,remove,load}. load(id,mode) accepts
append/replace and returns sceneIDs, missingIDs and resulting count. An optional
third argument {signal} cancels a load; the page aborts on unmount. Queue writes
still use existing setQueue/addMany operations.

Tests: node --test tests/*.test.js. Includes player completion and
skip callbacks, shuffle membership, refresh retention and reopen reset,
legacy cleanup, clear-and-refresh, stale imports, large queues, missing
scenes, storage failures, schema rejection, stale tabs, manual reorder, explicit
Play/Random intent, URL cleanup, weighted shuffle and ordinary-navigation guards.

This Stash UI plugin adds a tab-session playback queue without modifying Stash source files.

## Install

Copy this folder into your Stash plugins directory, then reload plugins from Stash settings.

The plugin includes:

- `stash-session-queue.yml`
- `stash-session-queue.js`
- `stash-session-queue.css`

## Behavior

- Adds a small queue button to rendered scene thumbnails on scene grid and wall pages.
- Stores the active queue and shuffle state in `sessionStorage` for the open tab only.
- Shows a floating bottom-right queue panel when the queue has items.
- Replaces the stock Queue tab beside the scene player with the plugin queue UI and hides the floating panel on player pages.
- Supports play, collapse, clear, remove, and native drag reorder.
- Adds a toggleable shuffle button that changes playback order without destructively reordering the visible queue.
- Uses Scene Preferences 0.1.0 when available to build weighted playback orders while preserving the visible manual queue.
- Adds per-generation **Ignore Preference Weights**, **Include Shuffle-Excluded Scenes**, and **Regenerate Shuffle Order** controls.
- Adds a top-toolbar Targeted Shuffle Queue page at `/plugins/session-queue-builder`.
- Adds a dedicated native-styled shuffle button beside Saved Filters and Edit Filter on the main Scenes browser. It builds and starts the plugin queue directly from the active filter, with rendered-link and URL fallbacks during initial page startup.
- Builds randomized queues from library-wide matches for selected character, franchise, and author tags.
- Applies preference-aware weighted sampling after Targeted Shuffle filters, so filters remain authoritative.
- Exposes `window.StashSessionQueue.addMany(sceneIDs)` for other Stash UI plugins and accepts `stash:session-scene-queue-add` custom events.
- Routes the video player's next and previous controls through the manual queue while queued items exist.
- Advances to the next manually queued scene when the current scene ends.
- Keeps player fullscreen during queued scene transitions when the browser allows the same fullscreen session to remain active.
- Intercepts Stash playback links containing explicit scene IDs or a serialized scene filter, imports their full ordered scene set into the plugin queue, and removes the native queue parameters from the player URL.
- Routes the Queue tab, player buttons, completion behavior, and `p n`/`p p`/`p r` playback shortcuts through the plugin queue.

Stash's queue implementation remains present in the application bundle, but version 1.7.2 makes it dormant during normal scene playback by migrating explicit queue-producing navigation into the plugin immediately. Opening an individual scene from the browser strips Stash's hidden filter-queue parameters and leaves the manual queue unchanged.

## Scene Preferences integration

Version 1.7.2 dynamically calls `window.ScenePreferences.generateShuffle()` when the optional Scene Preferences plugin is available. Standard shuffle stores the returned playback order separately from the visible queue. Targeted Shuffle records durable exposure only after its queue commit succeeds; standard shuffle records exposure as each shuffled scene is reached.

If Scene Preferences is disabled or unavailable, all existing queue behavior remains available with ordinary uniform shuffle.

