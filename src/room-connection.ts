// Normalize only the adapter's accepted direct-link format at submission time.
// Invalid input stays intact so the platform adapter remains the validator.
export function roomInputForSubmission(input:unknown){
 const value=String(input??'').trim()
 try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname==='live.douyin.com'&&!url.username&&!url.password&&/^\/\d{1,30}\/?$/.test(url.pathname))return url.pathname.replaceAll('/','')}catch{}
 return value
}
export function roomConnection(d:Partial<import('../shared/domain').PlatformState>={},source:string='live'){
 if(source==='test')return {label:'演练直播间',detail:'演练消息不会连接真实直播间。',connected:true,pending:false,offline:false}
 const status=d.status||'idle',offline=status==='offline',connected=status==='connected',pending=['initializing','connecting','retrying'].includes(status)
 const labels:Record<string,string>={offline:'直播间未开播 / 已结束',connected:'直播间已连接',initializing:'正在准备直播间',connecting:'直播间连接中',retrying:'直播间重连中',error:'直播间连接失败',idle:'直播间未连接'};const label=labels[status]||'直播间未连接'
 const detail=d.message||(offline?'暂时不会收到互动消息，开播后请重新连接。':pending?'正在连接，请稍候，无需重复操作。':connected?'等待观众新的互动消息。':'请确认直播间并连接后接收消息。')
 return {label,detail,connected,pending,offline}
}
