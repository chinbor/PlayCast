import GiftPicker from './GiftPicker'

const baseRules={likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,commentsEnabled:false,commentKeywords:[],gifts:[]}
const cleanKeywords=words=>[...new Set((Array.isArray(words)?words:[]).map(word=>word.trim()).filter(Boolean))]
export function rulesForCapabilities(rules={},capabilities){
  const current={...baseRules,...rules}
  const supports=type=>!capabilities||capabilities.messages?.includes(type)
  return {likesEnabled:!!current.likesEnabled&&supports('like'),likeEvery:supports('like')?current.likeEvery:100,
    followEnabled:!!current.followEnabled&&supports('follow'),follow:supports('follow')?current.follow:1,
    commentsEnabled:!!current.commentsEnabled&&supports('comment'),commentKeywords:supports('comment')&&Array.isArray(current.commentKeywords)?[...current.commentKeywords]:[],
    gifts:supports('gift')&&Array.isArray(current.gifts)?[...current.gifts]:[]}
}
export const defaultRules=capabilities=>rulesForCapabilities(baseRules,capabilities)
export function normalizeRules(rules,capabilities){const current=rulesForCapabilities(rules,capabilities);return {likesEnabled:!!current.likesEnabled,likeEvery:Number(current.likeEvery),followEnabled:!!current.followEnabled,follow:Number(current.follow),commentsEnabled:current.commentsEnabled,commentKeywords:cleanKeywords(current.commentKeywords),gifts:current.gifts.map(g=>({...g,reward:Number(g.reward)}))}}
export function validateRulesDraft(rules,capabilities){
  rules=rulesForCapabilities(rules,capabilities)
  const integer=(value,min,max)=>value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max
  if(!integer(rules.likeEvery,1,1000000))return '点赞门槛必须是 1 到 1000000 的整数。'
  if(!integer(rules.follow,0,100000))return '关注奖励必须是 0 到 100000 的整数。'
  if((rules.gifts||[]).some(gift=>!integer(gift.reward,0,100000)))return '每个礼物奖励必须是 0 到 100000 的整数。'
  const keywords=cleanKeywords(rules.commentKeywords)
  if(rules.commentsEnabled&&!keywords.length)return '请至少填写一个评论触发词'
  if(keywords.length>20||keywords.some(word=>word.length>80))return '最多设置 20 个评论词，每个词不超过 80 个字'
  return ''
}

export default function InteractionRules({rules,onChange,catalog,capabilities,refresh,disabled=false,previousRules}) {
  const thresholdChanged=previousRules&&(previousRules.likesEnabled!==rules.likesEnabled||Number(previousRules.likeEvery)!==Number(rules.likeEvery))
  const supports=type=>!capabilities||capabilities.messages?.includes(type)
  const giftsSupported=supports('gift')&&catalog?.status!=='unsupported'
  return <div className="interaction-rules"><div className="rules-fields">{supports('like')&&<><label className="rule-toggle"><input type="checkbox" checked={!!rules.likesEnabled} onChange={e=>onChange({...rules,likesEnabled:e.target.checked})}/><span><b>点赞加目标</b><small>每达到指定点赞数，目标 +1</small></span></label><label>每多少个赞 +1<input data-testid="rules-like-every" type="number" min="1" max="1000000" value={rules.likeEvery} onChange={e=>onChange({...rules,likeEvery:e.target.value===''?'':Number(e.target.value)})}/></label></>}{supports('follow')&&<><label className="rule-toggle"><input type="checkbox" checked={!!rules.followEnabled} onChange={e=>onChange({...rules,followEnabled:e.target.checked})}/><span><b>关注加目标</b><small>每位新关注用户只计算一次</small></span></label><label>每位关注增加<input data-testid="rules-follow-reward" type="number" min="0" max="100000" value={rules.follow} onChange={e=>onChange({...rules,follow:e.target.value===''?'':Number(e.target.value)})}/></label></>}</div>
    {supports('comment')&&<div className="comment-rule"><label className="rule-toggle"><input data-testid="rules-comments-enabled" type="checkbox" disabled={disabled} checked={!!rules.commentsEnabled} onChange={e=>onChange({...rules,commentsEnabled:e.target.checked})}/><span><b>评论词加目标</b><small>包含任意一个触发词，每条评论目标 +1</small></span></label>{rules.commentsEnabled&&<label className="form-label keyword-label">触发词（每行一个）<textarea data-testid="rules-comment-keywords" rows={3} disabled={disabled} placeholder={'加油\n冲冲冲'} value={(rules.commentKeywords||[]).join('\n')} onChange={e=>onChange({...rules,commentKeywords:e.target.value.split('\n')})}/><small>最多 20 个词，每词 80 字，英文区分大小写。同一条命中多个词只 +1，同一观众再次发送仍可计数。</small></label>}</div>}
    {thresholdChanged&&<p className="settings-note">修改点赞开关或门槛会清空当前尚未凑满的点赞余额；已完成的进度保留。新规则只对之后的消息生效。</p>}
    {giftsSupported?<GiftPicker catalog={catalog} gifts={rules.gifts||[]} onChange={gifts=>onChange({...rules,gifts})} refresh={refresh} disabled={disabled}/>:<p className="settings-note">当前平台不支持礼物目录。</p>}
    <p className="muted rules-footnote">互动仅在挑战进行中计数，平台重复推送不会重复增加。礼物按平台礼物 ID 识别；目录加载失败时，已有规则依然保留。</p>
  </div>
}
