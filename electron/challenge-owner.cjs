// Account ownership is explicit. A missing room on an old binding is never a wildcard.
const text=value=>typeof value==='string'&&!!value.trim()
const sameAccount=(a,b)=>!!a&&!!b&&text(a.platformId)&&text(a.accountScope)&&a.platformId===b.platformId&&a.accountScope===b.accountScope
const isAccountBinding=value=>value?.scope==='account'&&value.roomId===undefined
const validBinding=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&text(value.platformId)&&text(value.accountScope)&&(isAccountBinding(value)||value.scope===undefined&&text(value.roomId))
const ownsChallenge=(binding,owner)=>validBinding(binding)&&sameAccount(binding,owner)
const matchesChallenge=(binding,event)=>ownsChallenge(binding,event)&&(isAccountBinding(binding)||binding.roomId===event.roomId)
const accountBinding=owner=>({platformId:owner.platformId,accountScope:owner.accountScope,scope:'account'})
const accountKey=owner=>JSON.stringify([owner.platformId,owner.accountScope,'@account'])
module.exports={sameAccount,isAccountBinding,validBinding,ownsChallenge,matchesChallenge,accountBinding,accountKey}
