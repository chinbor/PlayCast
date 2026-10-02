const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createChallenge } = require('../electron/challenge.cjs')
const { mockGame } = require('../electron/collector.cjs')

const rules = () => ({ likesEnabled: true, likeEvery: 100, followEnabled: true, follow: 2, gifts: [
  { platformId: 'douyin', giftId: 'rose-1', name: 'Rose', icon: null, reward: 5 }
] })
const binding = { platformId: 'douyin', accountScope: 'host-1', roomId: 'room-1' }
const configured = (metricId = 'champion-kills', selectedBinding = null) => {
  const challenge = createChallenge()
  challenge.action('configure', { metricId, target: 10, rules: rules(), binding: selectedBinding })
  return challenge
}
const game = (kills, creep, time) => {
  const data = mockGame(0)
  data.allPlayers[0].scores.kills = kills
  data.allPlayers[0].scores.creepScore = creep
  data.gameData.gameTime = time
  return data
}

test('paused clock-only polls refresh heartbeat without marking durable state dirty',()=>{
 const c=configured();c.action('start');c.game(game(0,0,1),1000);c.action('pause')
 assert.equal(c.game(game(0,0,2),2000),false)
 assert.equal(c.state.game.at,2000)
 assert.equal(c.game(game(0,0,3),3000),false)
 assert.equal(c.state.game.at,3000)
})
test('configure creates an independent idle challenge and exposes its metric', () => {
  const challenge = configured('turret-kills', binding)
  const state = challenge.snapshot()
  assert.equal(state.configured, true)
  assert.equal(state.status, 'idle')
  assert.equal(state.metricId, 'turret-kills')
  assert.equal(state.metric.id, 'turret-kills')
  assert.deepEqual(state.binding, binding)
  assert.equal(state.target, 10)
  challenge.action('start')
  assert.throws(() => challenge.action('configure', { metricId: 'dragon-kills', target: 1, rules: rules(), binding }), /暂停|结束|idle|ended/)
})

test('kills begin at first valid baseline and count later player-only growth', () => {
  const challenge = configured('champion-kills')
  challenge.action('start')
  challenge.game(game(30, 30, 100), 1000)
  challenge.game(game(35, 35, 101), 1200)
  assert.equal(challenge.snapshot().completed, 5)
})

test('pause and resume establish a new baseline without counting the gap', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(2, 30, 100), 1000)
  challenge.game(game(3, 31, 101), 1200)
  challenge.action('pause')
  challenge.game(game(5, 33, 110), 1400)
  challenge.action('start')
  challenge.game(game(6, 34, 111), 1600)
  challenge.game(game(7, 35, 112), 1800)
  assert.equal(challenge.snapshot().completed, 2)
})

test('a new game keeps challenge progress but starts a fresh baseline', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(2, 30, 100), 1000)
  challenge.game(game(3, 31, 101), 1200)
  challenge.game(game(0, 0, 5), 1400)
  challenge.game(game(2, 2, 10), 1600)
  assert.equal(challenge.snapshot().completed, 3)
})

test('stale game data pauses before awarding a late delta', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(0, 0, 100), 1000)
  challenge.game(game(4, 4, 101), 122001)
  assert.equal(challenge.snapshot().status, 'paused')
  assert.equal(challenge.snapshot().completed, 0)
})

test('stale cross-game rebase retires old pending before new-game progress', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(0, 30, 100), 1000)
  challenge.action('pending', undefined, 1100)
  challenge.game(game(0, 0, 5), 122001)
  assert.equal(challenge.snapshot().status, 'running')
  assert.equal(challenge.snapshot().pending, 0)
  challenge.action('start')
  challenge.game(game(0, 0, 6), 122100)
  challenge.game(game(1, 1, 7), 122200)
  assert.equal(challenge.snapshot().completed, 2)
})

test('anomalous same-game rebases retire pending before later progress', () => {
  for (const anomaly of ['identity', 'team', 'counter']) {
    const challenge = configured()
    challenge.action('start')
    challenge.game(game(5, 30, 100), 1000)
    challenge.action('pending', undefined, 1100)
    const changed = game(anomaly === 'counter' ? 4 : 5, 30, 101)
    if (anomaly === 'identity') {
      changed.allPlayers[0].summonerName = 'different-player'
      changed.activePlayer.summonerName = 'different-player'
    }
    if (anomaly === 'team') changed.allPlayers[0].team = 'CHAOS'
    challenge.game(changed, 1200)
    assert.equal(challenge.snapshot().status, 'paused', anomaly)
    assert.equal(challenge.snapshot().pending, 0, anomaly)
    challenge.action('start')
    challenge.game(changed, 1400)
    changed.allPlayers[0].scores.kills++
    changed.gameData.gameTime = 102
    challenge.game(changed, 1600)
    assert.equal(challenge.snapshot().completed, 2, anomaly)
  }
})

test('same-player team change across a verified new game continues running', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(0, 30, 100), 1000)
  challenge.game(game(1, 31, 101), 1200)
  const next = game(0, 0, 5)
  next.allPlayers[0].team = 'CHAOS'
  challenge.game(next, 1400)
  assert.equal(challenge.snapshot().status, 'running')
  next.allPlayers[0].scores.kills = 1
  next.gameData.gameTime = 6
  challenge.game(next, 1600)
  assert.equal(challenge.snapshot().completed, 2)
})

test('pending corrections reconcile only observed new progress', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(5, 30, 100), 1000)
  challenge.action('pending', undefined, 1100)
  assert.equal(challenge.snapshot().completed, 1)
  challenge.game(game(6, 31, 101), 1200)
  assert.equal(challenge.snapshot().completed, 1)
  assert.equal(challenge.snapshot().pending, 0)
  challenge.game(game(7, 32, 102), 1400)
  assert.equal(challenge.snapshot().completed, 2)
})

test('paused API catch-up reconciles pending without counting unrelated paused progress', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(0, 30, 100), 1000)
  challenge.action('pending', undefined, 1100)
  challenge.action('pause')
  challenge.game(game(2, 31, 101), 1200)
  assert.equal(challenge.snapshot().pending, 0)
  assert.equal(challenge.snapshot().completed, 1)
  challenge.action('start')
  challenge.game(game(2, 31, 102), 1400)
  challenge.game(game(3, 32, 103), 1600)
  assert.equal(challenge.snapshot().completed, 2)
})

test('resume baseline reconciles pending catch-up already visible after the pause', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(0, 30, 100), 1000)
  challenge.action('pending', undefined, 1100)
  challenge.action('pause')
  challenge.action('start')
  challenge.game(game(1, 31, 102), 1400)
  challenge.game(game(2, 32, 103), 1600)
  assert.equal(challenge.snapshot().completed, 2)
  assert.equal(challenge.snapshot().pending, 0)
})

test('resume baseline at old value leaves pending for delayed API catch-up', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(0, 30, 100), 1000)
  challenge.action('pending', undefined, 1100)
  challenge.action('pause')
  challenge.action('start')
  challenge.game(game(0, 30, 101), 1400)
  assert.equal(challenge.snapshot().pending, 1)
  challenge.game(game(1, 31, 102), 1600)
  assert.equal(challenge.snapshot().completed, 1)
  assert.equal(challenge.snapshot().pending, 0)
})

test('pending requires an available and recent game metric', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.game(game(0, 30, 100), 1000)
  assert.throws(() => challenge.action('pending', undefined, 121001))
  const unsupported = game(0, 30, 101)
  unsupported.gameData.mapName = 'Map12'
  unsupported.gameData.gameMode = 'ARAM'
  challenge.game(unsupported, 1200)
  assert.equal(challenge.snapshot().metricStatus, 'mode-unavailable')
  assert.throws(() => challenge.action('pending', undefined, 1300))
  assert.equal(challenge.snapshot().pending, 0)
})

test('objective progress credits allied events once and never an enemy event', () => {
  const challenge = configured('baron-kills')
  const data = game(0, 0, 100)
  const ally = data.allPlayers[1].summonerName
  const enemy = data.allPlayers[5].summonerName
  challenge.action('start')
  challenge.game(data, 1000)
  data.events.Events = [{ EventID: 1, EventName: 'BaronKill', EventTime: 101, KillerName: ally }]
  challenge.game(data, 1200)
  data.events.Events.push({ EventID: 1, EventName: 'BaronKill', EventTime: 101, KillerName: ally })
  data.events.Events.push({ EventID: 2, EventName: 'BaronKill', EventTime: 102, KillerName: enemy })
  challenge.game(data, 1400)
  assert.equal(challenge.snapshot().completed, 1)
})

test('unknown objective owner never credits progress and marks metric unavailable', () => {
  const challenge = configured('dragon-kills')
  const data = game(0, 0, 100)
  challenge.action('start')
  challenge.game(data, 1000)
  data.events.Events = [{ EventID: 1, EventName: 'DragonKill', EventTime: 101, KillerName: 'unknown' }]
  challenge.game(data, 1200)
  assert.equal(challenge.snapshot().completed, 0)
  assert.equal(challenge.snapshot().metricStatus, 'unavailable')
})

test('metric availability changes notify the controller even without progress', () => {
  const challenge = configured('dragon-kills')
  challenge.action('start')
  challenge.game(game(0, 0, 100), 1000)
  assert.equal(challenge.snapshot().metricStatus, 'available')
  assert.equal(challenge.game(null, 1200), true)
  assert.equal(challenge.snapshot().metricStatus, 'waiting')
})

test('event provenance must match all configured binding fields', () => {
  const challenge = configured('champion-kills', binding)
  challenge.action('start')
  const basic = { id: 'same', type: 'like', count: 100 }
  assert.equal(challenge.event({ ...basic, platformId: 'other', accountScope: 'host-1', roomId: 'room-1' }), false)
  assert.equal(challenge.event({ ...basic, platformId: 'douyin', accountScope: 'other', roomId: 'room-1' }), false)
  assert.equal(challenge.event({ ...basic, platformId: 'douyin', accountScope: 'host-1', roomId: 'other' }), false)
  assert.equal(challenge.snapshot().target, 10)
  challenge.event({ ...basic, ...binding })
  assert.equal(challenge.snapshot().target, 11)
})

test('gift rewards require platform and gift IDs and consume incremental count', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.event({ id: 'g1', type: 'gift', platformId: 'other', giftId: 'rose-1', giftName: 'Rose', count: 3 })
  challenge.event({ id: 'g2', type: 'gift', platformId: 'douyin', giftId: 'other', giftName: 'Rose', count: 3 })
  challenge.event({ id: 'g3', type: 'gift', platformId: 'douyin', giftId: 'rose-1', giftName: 'Changed', count: 3 })
  challenge.event({ id: 'g3', type: 'gift', platformId: 'douyin', giftId: 'rose-1', count: 3 })
  assert.equal(challenge.snapshot().target, 25)
  assert.equal(challenge.snapshot().stats.gifts, 9)
})

test('rule changes affect future events only and reset like remainder', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.event({ id: 'l1', type: 'like', count: 90 })
  challenge.action('rules', { ...rules(), likeEvery: 10 })
  challenge.event({ id: 'l2', type: 'like', count: 10 })
  assert.equal(challenge.snapshot().target, 11)
})

test('editing follow and gift rules preserves the like remainder', () => {
  const challenge = configured()
  challenge.action('start')
  challenge.event({ id: 'l1', type: 'like', count: 90 })
  challenge.action('rules', { ...rules(), follow: 3, gifts: [] })
  challenge.event({ id: 'l2', type: 'like', count: 10 })
  assert.equal(challenge.snapshot().target, 11)
  assert.equal(challenge.snapshot().likeBalance, 0)
})

test('invalid configuration is rejected without replacing current challenge', () => {
  const challenge = configured()
  assert.throws(() => challenge.action('configure', { metricId: 'deaths', target: 1, rules: rules(), binding: null }))
  assert.throws(() => challenge.action('configure', { metricId: 'turret-kills', target: -1, rules: rules(), binding: null }))
  assert.throws(() => challenge.action('configure', { metricId: 'turret-kills', target: 1, rules: { ...rules(), likeEvery: 0 }, binding: null }))
  assert.throws(() => challenge.action('configure', { metricId: 'turret-kills', target: 1, rules: { ...rules(), gifts: [...rules().gifts, rules().gifts[0]] }, binding: null }))
  assert.equal(challenge.snapshot().metricId, 'champion-kills')
})

test('v1 migration preserves progress but disables comment and gift-name rewards', () => {
  const legacy = {
    version: 1, id: 'old', status: 'running', target: 20, auto: 3, adjustment: 2, pending: 1,
    rules: { follow: 1, likeEvery: 100, giftName: 'Rose', giftReward: 5, keyword: 'win', commentReward: 2 },
    stats: { likes: 0, follows: 0, comments: 0, gifts: 0 }, likeBalance: 0,
    seen: [], followed: [], commenters: {}, combos: {}, game: null, logs: []
  }
  const challenge = createChallenge(legacy)
  assert.equal(challenge.snapshot().completed, 6)
  assert.equal(challenge.snapshot().status, 'paused')
  assert.equal(challenge.snapshot().pending, 0)
  assert.ok(challenge.snapshot().migrationNotice)
  challenge.action('start')
  challenge.event({ id: 'c', type: 'comment', text: 'win', userId: 'u' })
  challenge.event({ id: 'g', type: 'gift', platformId: 'douyin', giftId: 'rose-1', giftName: 'Rose', count: 1 })
  assert.equal(challenge.snapshot().target, 20)
})

test('legacy binding preserves migrated progress and can happen only once', () => {
  const legacy = { version: 1, id: 'old', status: 'running', target: 20, auto: 3, adjustment: 2, pending: 1,
    rules: { follow: 1, likeEvery: 100, giftName: 'Rose', giftReward: 5 },
    stats: { likes: 0, follows: 0, comments: 0, gifts: 0 }, seen: [], followed: [], logs: [] }
  const challenge = createChallenge(legacy)
  assert.throws(() => challenge.action('bindLegacy', { ...binding, roomId: '' }))
  assert.equal(challenge.snapshot().configured, false)
  challenge.action('bindLegacy', binding)
  assert.equal(challenge.snapshot().configured, true)
  assert.deepEqual(challenge.snapshot().binding, binding)
  assert.equal(challenge.snapshot().completed, 6)
  assert.equal(challenge.snapshot().target, 20)
  assert.equal(challenge.snapshot().status, 'paused')
  assert.throws(() => challenge.action('bindLegacy', binding))
  assert.throws(() => configured().action('bindLegacy', binding))
})
