const {test}=require('node:test')
const assert=require('node:assert/strict')
test('release validates version tags and leaves manual branch builds unpublished',async()=>{
  const {validateRelease}=await import('../scripts/check-release.mjs')
  assert.equal(validateRelease('refs/tags/v0.2.2','0.2.2'),true)
  assert.equal(validateRelease('refs/heads/main','0.2.2'),false)
  assert.throws(()=>validateRelease('refs/tags/v0.2.1','0.2.2'),/does not match/)
  assert.throws(()=>validateRelease('refs/tags/v0.2.2','not-a-version'),/Invalid package version/)
})
