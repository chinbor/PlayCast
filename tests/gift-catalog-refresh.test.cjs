const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createGiftCatalog } = require('../electron/gift-catalog.cjs')

const scope = { platformId: 'douyin', accountScope: 'a', roomId: 'r' }

test('refresh replaces stale official entries while retaining observed supplements', () => {
  const catalog = createGiftCatalog()
  catalog.replace(scope, [{ giftId: 'old', name: 'Old official' }])
  catalog.observe(scope, { giftId: 'seen', giftName: 'Seen live' })
  catalog.replace(scope, [{ giftId: 'new', name: 'New official' }])
  const items = catalog.snapshot(scope).items
  assert.deepEqual(items.map(item => item.giftId), ['new', 'seen'])
  assert.equal(items.find(item => item.giftId === 'seen').source, 'observed')
  assert.equal(items.find(item => item.giftId === 'new').source, 'official')
  assert.deepEqual(createGiftCatalog(catalog.export()).snapshot(scope).items.map(item => item.giftId), ['new', 'seen'])
})
