const { METRICS } = require('./game-metrics.cjs')
const { createChallenge } = require('./challenge.cjs')
const {sameAccount}=require('./challenge-owner.cjs')

const key = (binding, metricId, modeGroup='classic') => JSON.stringify([binding.platformId, binding.accountScope, binding.roomId, modeGroup, metricId])
const completed = state => state.auto + state.adjustment + state.pending

function createChallengeLibrary(saved, store) {
  const drafts = new Map()
  const history = new Map()
  const pending = new Map()
  // Bounded, account-scoped receipts let an open confirmation retry a failed save.
  const removed = new Map()
  let revision=0
  let presence=null
  const summarize = ({id,modeGroup='classic',metricId,metric,binding,createdAt,startedAt,endedAt,result,target,completed}) => ({id,modeGroup,metricId,metric,binding,createdAt,startedAt,endedAt,result,target,completed})
  const detail = id => pending.get(id) || (store ? store.readDetail(id) : history.get(id))
  for (const state of saved?.drafts || []) {
    if (state?.binding && state.configured && state.status !== 'ended') {
      const restored = createChallenge(state)
      drafts.set(restored.state.id, structuredClone(restored.state))
    }
  }
  for (const record of saved?.history || []) {
    if (record?.id && record.binding && ['completed', 'ended-early'].includes(record.result) && !history.has(record.id)) {history.set(record.id, structuredClone(store?summarize(record):record));if(store&&record.logs)pending.set(record.id,structuredClone(record))}
  }
  revision=history.size
  return {
    hasHistory(binding){
      if(!binding)return false
      if(presence?.revision===revision&&sameAccount(presence.binding,binding))return presence.value
      let value=false
      for(const row of history.values())if(sameAccount(row.binding,binding)){value=true;break}
      presence={revision,binding:{platformId:binding.platformId,accountScope:binding.accountScope},value}
      return value
    },
    remove(binding,id){
      const row=history.get(id)
      if(!row&&sameAccount(removed.get(id),binding))return false
      if(!row||!sameAccount(row.binding,binding))throw Error('找不到当前账号的这条挑战历史')
      history.delete(id);pending.delete(id);revision++
      removed.set(id,{platformId:row.binding.platformId,accountScope:row.binding.accountScope})
      while(removed.size>100)removed.delete(removed.keys().next().value)
      return true
    },
    put(challenge) {
      const state = challenge.state
      if (!state.configured || !state.binding || state.status === 'ended') return
      drafts.set(state.id, structuredClone(state))
    },
    get(binding, metricId, modeGroup='classic') {
      if (!binding || !metricId) return null
      const state = [...drafts.values()].find(state=>key(state.binding,state.metricId,state.modeGroup)===key(binding,metricId,modeGroup))
      return state ? createChallenge(state) : null
    },
    getById(owner,id){const state=drafts.get(id);return state&&sameAccount(state.binding,owner)?createChallenge(state):null},
    ownedSlots(owner){return [...drafts.values()].filter(state=>sameAccount(state.binding,owner)).map(state=>({id:state.id,modeGroup:state.modeGroup,metricId:state.metricId,status:state.status,target:state.target,completed:completed(state),binding:structuredClone(state.binding)}))},
    slots(binding) {
      if (!binding) return []
      return [...drafts.values()].filter(state => state.binding.platformId === binding.platformId && state.binding.accountScope === binding.accountScope && state.binding.roomId === binding.roomId)
        .map(state => ({ id: state.id, modeGroup:state.modeGroup, metricId: state.metricId, status: state.status, target: state.target, completed: completed(state) }))
    },
    settle(challenge, result, endedAt = Date.now()) {
      const state = challenge.state
      if (history.has(state.id)) return structuredClone(detail(state.id))
      if (!state.binding || !['completed', 'ended-early'].includes(result)) throw new Error('挑战结算信息无效')
      const metric = METRICS.find(item => item.id === state.metricId)
      const record = structuredClone({ id: state.id, modeGroup:state.modeGroup, metricId: state.metricId, metric,
        binding: state.binding, createdAt: state.createdAt, startedAt: state.startedAt, endedAt,
        result, target: state.target, completed: completed(state), rules: state.rules, stats: state.stats,
        contributions: state.contributions, contributionsComplete: state.contributionsComplete,
        auto: state.auto, adjustment: state.adjustment, pending: state.pending, logs: state.logs })
      history.set(state.id, store?summarize(record):record)
      revision++
      if(store)pending.set(state.id,record)
      drafts.delete(state.id)
      return structuredClone(record)
    },
    historyFor(binding) {
      if (!binding) return []
      return [...history.values()].filter(record => sameAccount(record.binding, binding))
        .sort((a, b) => b.endedAt - a.endedAt).map(record => structuredClone(detail(record.id)))
    },
    query(binding,{page=1,modeGroup,metricId,result}={}) {
      const owned=binding?[...history.values()].filter(r=>sameAccount(r.binding,binding)):[]
      const rows=owned.filter(r=>(!modeGroup||(r.modeGroup??'classic')===modeGroup)&&(!metricId||r.metricId===metricId)&&(!result||r.result===result)).sort((a,b)=>b.endedAt-a.endedAt)
      page=Number.isSafeInteger(page)&&page>0?page:1
      page=Math.min(page,Math.max(1,Math.ceil(rows.length/20)))
      return {items:rows.slice((page-1)*20,page*20).map(r=>structuredClone(summarize(r))),page,pageSize:20,total:rows.length,completedCount:owned.filter(r=>r.result==='completed').length}
    },
    async detail(binding,id){const row=history.get(id);if(!row||!sameAccount(row.binding,binding))return null;return structuredClone(pending.get(id)||(store?await store.detail(id):row))},
    pending:()=>[...pending.values()],
    release(){if(store)for(const id of pending.keys())if(store.readDetail(id))pending.delete(id)},
    get version(){return revision},
    export(excludeDraftId) { return { drafts: [...drafts.values()].filter(value=>value.id!==excludeDraftId).map(value => structuredClone(value)), history: [...history.values()].map(value => structuredClone(value)) } }
  }
}
module.exports = { createChallengeLibrary }
