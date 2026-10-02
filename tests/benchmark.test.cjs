const {test}=require('node:test')
const assert=require('node:assert/strict')
const {summarize}=require('../scripts/benchmark.cjs')
test('benchmark statistics preserve samples and compute the median and nearest-rank p95',()=>{
  const values=[90,10,30,50]
  assert.deepEqual(summarize(values),{samples:4,medianMs:40,p95Ms:90})
  assert.deepEqual(values,[90,10,30,50])
})
