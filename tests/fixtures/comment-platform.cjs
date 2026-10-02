// Test-only platform with no likes, follows, gifts, or external network.
const {createNormalizer}=require('../../electron/interaction-normalizer.cjs')
module.exports=({onState})=>{
  let account={status:'signed-out',profile:null},status='idle',normalizer=createNormalizer()
  const login=()=>{account={status:'authenticated',profile:{id:'comment-account',nickname:'能力测试账号'}};onState()}
  return {
    descriptor:{id:'comment-only',name:'能力测试平台',capabilities:{login:['official-window'],messages:['comment'],giftCatalog:false}},
    getAccount:()=>account,getState:()=>({status}),login,refreshAccount:login,
    logout(){account={status:'signed-out',profile:null};onState()},
    parseRoom(input){if(!/^\d+$/.test(input))throw Error('测试房间号无效');return input},
    connect(){status='connected';onState()},disconnect(){status='idle';onState()},dispose(){},
    normalize:(event,scope)=>normalizer.normalize(event,scope),exportNormalizer:()=>normalizer.export(),restoreNormalizer(saved){normalizer=createNormalizer(saved)}
  }
}
