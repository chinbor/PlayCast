const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mockGame } = require('../electron/collector.cjs')
const { METRICS, readMetric } = require('../electron/game-metrics.cjs')

test('catalog exposes the five supported gameplay metrics', () => {
  assert.deepEqual(METRICS.map(metric => metric.id), [
    'champion-kills', 'turret-kills', 'baron-kills', 'dragon-kills', 'herald-kills'
  ])
  assert.equal(METRICS.find(metric => metric.id === 'turret-kills').scope, 'team')
})

test('personal metrics read only the active player counters', () => {
  const data = mockGame(0)
  data.allPlayers[0].scores.kills = 3
  data.allPlayers[0].scores.creepScore = 30
  data.allPlayers[1].scores.kills = 8
  data.allPlayers[1].scores.creepScore = 80
  assert.equal(readMetric(data, 'champion-kills').value, 3)
  assert.equal(readMetric(data, 'creep-score').status, 'unavailable')
})

test('team objectives include allied kills once and exclude enemy kills', () => {
  const data = mockGame(0)
  const ally = data.allPlayers[1].summonerName
  const enemy = data.allPlayers[5].summonerName
  data.events.Events = [
    { EventID: 1, EventName: 'BaronKill', EventTime: 20, KillerName: ally },
    { EventID: 1, EventName: 'BaronKill', EventTime: 20, KillerName: ally },
    { EventID: 2, EventName: 'BaronKill', EventTime: 22, KillerName: enemy },
    { EventID: 3, EventName: 'DragonKill', EventTime: 25, KillerName: ally },
    { EventID: 4, EventName: 'HeraldKill', EventTime: 30, KillerName: ally },
    { EventID: 5, EventName: 'VoidGrubKill', EventTime: 31, KillerName: ally }
  ]
  assert.equal(readMetric(data, 'baron-kills').value, 1)
  assert.equal(readMetric(data, 'dragon-kills').value, 1)
  assert.equal(readMetric(data, 'herald-kills').value, 1)
})

test('objective ownership must be known before progress is available', () => {
  const data = mockGame(0)
  data.events.Events = [{ EventID: 7, EventName: 'BaronKill', EventTime: 20, KillerName: 'unknown' }]
  const result = readMetric(data, 'baron-kills')
  assert.equal(result.status, 'unavailable')
  assert.equal(result.value, null)
})

test('protocol-supported objectives wait at zero before a matching event', () => {
  const data = mockGame(0)
  data.events.Events = []
  const result = readMetric(data, 'baron-kills')
  assert.equal(result.status, 'available')
  assert.equal(result.value, 0)
  assert.equal(METRICS.find(metric => metric.id === 'baron-kills').protocolVerified, true)
})

test('missing event feed remains waiting rather than inventing a zero', () => {
  const data = mockGame(0)
  delete data.events
  assert.equal(readMetric(data, 'dragon-kills').status, 'waiting')
})

test('unsupported mode is unavailable even when counters are present', () => {
  const data = mockGame(0)
  data.gameData.gameMode = 'URF'
  assert.equal(readMetric(data, 'champion-kills').status, 'mode-unavailable')
  assert.equal(readMetric(data, 'herald-kills').value, null)
})
