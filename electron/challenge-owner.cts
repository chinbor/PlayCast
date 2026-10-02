import type { AccountOwner, AccountBinding, ChallengeBinding, RoomScope } from '../shared/domain.js';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

// Account ownership is explicit. A missing room on an old binding is never a wildcard.
const text=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()
const sameAccount=(a:unknown,b:unknown):boolean=>object(a)&&object(b)&&text(a.platformId)&&text(a.accountScope)&&a.platformId===b.platformId&&a.accountScope===b.accountScope
const isAccountBinding=(value:unknown):value is AccountBinding=>object(value)&&value.scope==='account'&&value.roomId===undefined
const validBinding=(value:unknown):value is ChallengeBinding=>object(value)&&text(value.platformId)&&text(value.accountScope)&&(isAccountBinding(value)||value.scope===undefined&&text(value.roomId))
const ownsChallenge=(binding:unknown,owner:unknown):binding is ChallengeBinding=>validBinding(binding)&&sameAccount(binding,owner)
const matchesChallenge=(binding:unknown,event:Partial<Pick<RoomScope,'platformId'|'accountScope'|'roomId'>>)=>ownsChallenge(binding,event)&&(isAccountBinding(binding)||binding.roomId===event.roomId)
const accountBinding=(owner:AccountOwner):AccountBinding=>({platformId:owner.platformId,accountScope:owner.accountScope,scope:'account'})
const accountKey=(owner:AccountOwner)=>JSON.stringify([owner.platformId,owner.accountScope,'@account'])
export {sameAccount,isAccountBinding,validBinding,ownsChallenge,matchesChallenge,accountBinding,accountKey};
