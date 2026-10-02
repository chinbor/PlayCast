# Task 2 implementation report

Implemented normalized incremental interaction events outside challenge, scope-keyed high-water persistence, safe gift catalog normalization/cache and a verified official HTTPS directory request. Product owns staged onboarding, adapter routing, capability guards, identity/room binding, gift request cancellation, per-metric presets and logout preservation. Default Douyin adapter provides room parsing, real session auth and catalog; adapterFactories permits isolated second-platform tests.

RED: interaction-normalizer/gift-catalog modules initially absent; wire icon assertion failed undefined vs HTTPS URL; product-flow failed because prior product did not accept platform adapters or onboarding. GREEN: node --test tests/douyin-auth.test.cjs tests/product-flow.test.cjs tests/gift-catalog.test.cjs tests/interaction-normalizer.test.cjs tests/douyin-wire.test.cjs => 27 pass, 0 failures. Old logout test updated to explicitly select/authenticate/confirm/configure before start, assertion coverage retained.

Real request validation using new requestDouyinGifts with global fetch (no Cookie): 1287 items, 1287 HTTPS icons. Endpoint identified in actual official script, evidence in 2026-09-28-protocol-evidence.md. This verifies retrieval/normalization, not authenticated gift delivery or permanent completeness.

UI smoke fixtures replace account response and network capture only, keeping auth state machine/adapter/product real; new guided smoke currently RED because old UI has no platform step. Main smoke moved into tests/guided-smoke.cjs. Tests are isolated with temporary userData, no genuine credentials.

No Git repository. Baseline copies are .review-baseline, diff package generated with git diff --no-index. No commits. Remaining work: UI and final integration; real game and authenticated stream verification still require actual sessions.

## Review fixes

- Normalizer rejects any explicitly supplied `platformId`, `accountScope`, or `roomId` that disagrees with the selected scope before touching deduplication or combo state. Unscoped wire events remain valid. Product applies the same guard before observing a gift in the catalog, so rejected raw events cannot pollute the cache.
- Platform registration now checks the methods product actually calls: `parseRoom`, `getState`, `normalize`, `exportNormalizer`, and `restoreNormalizer`, in addition to the prior lifecycle methods. An adapter advertising `giftCatalog` must also provide `getGiftCatalog`.
- Gift catalog keeps official and observed entries separately. A successful official refresh replaces earlier official-only entries and retains genuine observed supplements with `source: 'observed'`; official items have `source: 'official'`. Export/restore preserves that split; a failed refresh still retains the last cache.
- Rule presets now use the full platform/account/room scope key. Snapshot exposes only presets for the currently confirmed exact scope. Configuration and rule edits reject gifts from another platform before changing challenge state.
- Test mode also hides live rule presets; a RED source-switch assertion initially caught their exposure, and the snapshot now requires the live source before returning scoped presets.
- Gift wire parsing no longer invents count 1 when every supported quantity field is absent. The normalizer drops that nonpositive count, so no reward is awarded.

RED: `node --test tests/interaction-normalizer.test.cjs tests/gift-catalog-refresh.test.cjs tests/platforms.test.cjs tests/product-flow.test.cjs` failed 6 review cases (provenance, stale official entry, adapter contract, catalog pollution, preset scope, cross-platform gift). `node --test tests/douyin-wire.test.cjs` failed the missing-quantity case with actual count 1 versus expected 0. A further `node --test tests/product-flow.test.cjs` failed 1/6 after adding the test-mode preset isolation assertion, then passed 6/6 after the guard. GREEN: `node --test tests/interaction-normalizer.test.cjs tests/product-flow.test.cjs tests/platforms.test.cjs tests/gift-catalog.test.cjs tests/gift-catalog-refresh.test.cjs tests/douyin-wire.test.cjs` passed 20/20, exit 0. All six named test files were confirmed present with `rg --files tests`.
