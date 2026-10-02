# Task 1 report: protocol dispatch and diagnostics

## Changes

- `electron/douyin-wire.cjs`: `event()` checks the supported method before parsing the payload. Room and control messages parse only their own fields, without requiring a user or message ID. `isSupportedMethod(method)` exposes the same dispatch set to the connector. Interaction message mapping, exact string IDs, gift quantities, and malformed protobuf failures remain intact.
- `electron/douyin.cjs`: frame decoding, supported-message decoding, and event processing have separate error handling. A failed callback does not prevent later messages in the batch. ACK and cursor updates precede per-message processing; the close control signal still ends the connection.
- `electron/douyin-diagnostics.cjs`: a bounded in-memory diagnostic ring. Each entry has only `{method, stage, code, timestamp, payloadSize}`. Methods are limited to a bounded `Webcast…Message` identifier, stages to `decode`, `frame`, `processing`, and codes to a small allowlist; unsafe values become `unknown` or `UNKNOWN`. Payload size is a bounded integer. No payload, username, URL, cookie, or arbitrary error message is stored.

## Exact connector interface

`snapshot()` retains `received`, `decoded`, `errors`, `giftReceived`, `giftDecoded`, and `giftErrors`, and adds `unsupported`, `ignored`, `frameErrors`, and `processingErrors`. `diagnostics()` returns a defensive copy of at most 50 metadata entries. `clearDiagnostics()` empties that list. A new `connect()` resets the counters and diagnostic list.

Counter meanings:

| Counter | Meaning |
| --- | --- |
| `received` | All message envelopes in successfully decoded response frames. |
| `decoded` | Supported interaction events decoded and passed to the event callback; a callback throw still counts as decoded. |
| `errors` | Supported-message payload decode failures only. |
| `unsupported` | Unknown method envelopes; these are not failures. |
| `ignored` | Supported messages intentionally yielding no event, such as a cancelled follow; these are not failures. |
| `frameErrors` | Damaged frame or response-envelope decode failures. |
| `processingErrors` | Event callback/state or ACK send failures after decoding. |
| `giftReceived` | Gift method envelopes received. |
| `giftDecoded` | Gift events decoded successfully. |
| `giftErrors` | Gift payload decode failures. |

Room and control events update state or end the connection; they do not increment `decoded` or `ignored`.

## TDD evidence

- Wire RED: `node --test tests/douyin-wire.test.cjs` exited 1, 7 pass / 2 fail. The control fixture failed with `ERR_INVALID_ARG_TYPE` from `Buffer.from(3n)`; the unknown-method numeric field failed the same way. The supported malformed-payload assertion passed.
- Wire GREEN: the same command exited 0, 9 pass / 0 fail.
- Diagnostics RED: after introducing an empty helper interface, `node --test tests/douyin-diagnostics.test.cjs` exited 1, 0 pass / 2 assertion failures (`0 !== 50` and empty snapshot). The initial missing-module invocation also exited 1 but was not treated as the behavioral RED.
- Diagnostics GREEN: the same command exited 0, 2 pass / 0 fail.
- Connector RED: `node --test tests/douyin-connector.test.cjs` exited 1, 0 pass / 2 fail; new `unsupported` and `frameErrors` counters were `undefined`.
- Connector GREEN: `node --test tests/douyin-connector.test.cjs tests/douyin-diagnostics.test.cjs tests/douyin-wire.test.cjs` exited 0, 13 pass / 0 fail. Fixtures prove callback/decode separation, safe diagnostics, bounded eviction, same-batch continuation, ACK, and frame classification.
- Full verification: `npm.cmd test` exited 0, 124 pass / 0 fail / 0 cancelled.

## Self-review and limits

Only protocol, connector, diagnostic helper, tests, and this report were edited. No frontend or storage code was changed. Fixtures use artificial data and do not connect to any account or inspect credentials. Real service behavior remains unverified; the connector contract and protobuf edge cases are covered by local tests.

## Independent review fixes

Two connector accounting paths were corrected after review:

1. A terminal control message now commits `received` for every envelope in its decoded frame and all counters accumulated before that control message, then ends the connection. Messages after the terminal control are not processed. The terminal state remains `idle` with the end message.
2. A room state callback failure and a final batch state callback failure are recorded as `processingErrors` with safe diagnostic metadata. State is committed before invoking the callback; a failure increments the counter directly and does not invoke the same callback recursively. A room callback failure therefore cannot suppress a later valid interaction in the batch.

Review-fix TDD evidence:

- RED: `node --test tests/douyin-connector.test.cjs` exited 1, 2 pass / 3 fail. Terminal control left `received` at `0` instead of `4`; the room callback threw into the socket handler; the final batch callback escaped despite an expected non-throwing message dispatch.
- GREEN: `node --test tests/douyin-connector.test.cjs tests/douyin-wire.test.cjs tests/douyin-diagnostics.test.cjs` exited 0, 16 pass / 0 fail.
- Full verification after the review fixes: `npm.cmd test` exited 0, 127 pass / 0 fail / 0 cancelled.
