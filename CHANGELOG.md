# 1.8.5 - 2026-10-15

- Active queues are tab-scoped again: refresh retains the queue, but opening,
  copying or restoring a tab starts empty, independently of the Stash server.
- Discard the old permanently stored active queue without affecting named saves.
- Never create a queue from startup/history URLs or autoplay parameters alone;
  native queue imports require a fresh explicit Play action.

# 1.8.4 - 2026-10-07

- Follow the highlighted current scene at the top of the queue viewport, including
  the last row, while keeping played scenes above it for scrolling back.
- Display actual shuffle playback order and make drag reorder update that order.
- Preserve excluded items outside playback and align the queue when its tab opens.

# 1.8.3 - 2026-10-07

- Patch ScenePlayer Next, Previous, and completion callbacks directly so native
  rerenders cannot restore stock queue navigation during shuffled playback.
- Remove competing media-ended listeners and ignore completion from old scenes.
- Stop at the end of the active queue; never fall back to native library playback.
- Restrict shuffle-provider results to the requested scene IDs.
- Leave embedded review-player navigation under its own owner's control.

# 1.8.2 - 2026-10-07

- Persist the active queue and shuffle state together in browser localStorage;
  migrate the prior tab-session queue without regenerating playback order.
- Restore existing queues (including manually cleared queues) on refresh instead
  of replacing them from native playback URL parameters.
- Make playback-order reads read-only and retain weighted shuffle exclusions.
- Reject delayed native imports and shuffle results after subsequent queue edits.
- Synchronize active-queue changes across tabs at the same Stash address.

# 1.8.1 - 2026-10-05

- Fix native `p n`, `p p`, and `p r` callbacks being overwritten by ScenePage
  rerenders. Patch the existing callback props, leaving native keyboard scope,
  editable-field suppression, binding and cleanup ownership intact.
- Saved queue schema, ordinary-browsing import guards and queue ordering unchanged.
- Skip disposed/rootless players during control restoration and listener attachment;
  navigation can leave InteractiveUtils briefly referring to the previous player.

# 1.8.0 - 2026-10-05

- Named Saved Queues page: save, Save As, rename, delete, replace and append.
- Schema-1 browser-local persistence with defensive decoding and cross-tab reads.
- GraphQL existence validation and missing-scene reporting before queue changes.
- Public replace and saved-list APIs; existing 1.7.2 import safeguards retained.
- Ten focused regression tests added; all 22 queue tests pass.
- Nullable individual GraphQL lookups tolerate removed scenes on Native Audio builds.
- Future per-queue schema versions are rejected without overwriting saved data.
- Navigating away cancels pending saved loads without modifying the session.
- No audio queue work or media/metadata writes.

