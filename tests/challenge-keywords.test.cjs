const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createChallenge } = require('../electron/challenge.cjs')

const rules = (extra = {}) => ({ likesEnabled: false, likeEvery: 100, followEnabled: false, follow: 0, gifts: [], commentsEnabled: true, commentKeywords: [' win ', '胜利', 'win'], ...extra })
const configured = () => { const c = createChallenge(); c.action('configure', { metricId: 'champion-kills', target: 10, rules: rules(), binding: null }); return c }

test('matching comments reward one per distinct message, including repeated authors, and survive restart deduplication', () => {
  const c = configured()
  assert.deepEqual(c.state.rules.commentKeywords, ['win', '胜利'])
  c.action('start')
  c.event({ id: 'one', type: 'comment', text: 'win 胜利', userId: 'viewer' })
  c.event({ id: 'one', type: 'comment', text: 'win 胜利', userId: 'viewer' })
  c.event({ id: 'two', type: 'comment', text: 'win again', userId: 'viewer' })
  c.event({ id: 'three', type: 'comment', text: 'WIN', userId: 'viewer' })
  assert.equal(c.state.target, 12)
  assert.deepEqual(c.state.contributions, { like: 0, follow: 0, comment: 2, gift: 0 })
  assert.equal(c.state.stats.comments, 3)
  const restored = createChallenge(structuredClone(c.state))
  restored.action('start')
  restored.event({ id: 'one', type: 'comment', text: 'win 胜利', userId: 'viewer' })
  assert.equal(restored.state.target, 12)
})

test('paused or disabled comments cannot reward later, and invalid keyword changes are transactional', () => {
  const c = configured()
  c.action('start')
  c.action('pause')
  c.event({ id: 'paused', type: 'comment', text: 'win' })
  c.action('start')
  c.event({ id: 'paused', type: 'comment', text: 'win' })
  assert.equal(c.state.target, 10)
  const before = structuredClone(c.state.rules)
  for (const keywords of [[], ['  '], Array.from({ length: 21 }, (_, i) => String(i)), ['x'.repeat(81)]]) {
    assert.throws(() => c.action('rules', rules({ commentKeywords: keywords })))
    assert.deepEqual(c.state.rules, before)
  }
  c.action('rules', rules({ commentsEnabled: false, commentKeywords: [] }))
  c.event({ id: 'disabled', type: 'comment', text: 'win' })
  assert.equal(c.state.target, 10)
})

test('contributions reflect rewards actually added even at maximum target', () => {
  const c = createChallenge()
  c.action('configure', { metricId: 'champion-kills', target: 999999, rules: { ...rules(), likesEnabled: true, likeEvery: 1, followEnabled: true, follow: 2, gifts: [{ platformId: 'douyin', giftId: 'g', name: 'Gift', reward: 3 }] }, binding: null })
  c.action('start')
  c.event({ id: 'like', type: 'like', count: 2 })
  c.event({ id: 'follow', type: 'follow', userId: 'u' })
  c.event({ id: 'comment', type: 'comment', text: 'win' })
  c.event({ id: 'gift', type: 'gift', platformId: 'douyin', giftId: 'g', count: 1 })
  assert.equal(c.state.target, 1000000)
  assert.deepEqual(c.state.contributions, { like: 1, follow: 0, comment: 0, gift: 0 })
  assert.equal(c.state.contributionsComplete, true)
})
