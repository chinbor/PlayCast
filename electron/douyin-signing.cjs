const {randomInt}=require('node:crypto')
const {sm3:digest}=require('./sm3.cjs')

// Node implementation of the request-signing protocol used by dycast's
// src/core/abogus.js. No imports from reference repositories or browser globals.
const BASE64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const UA_ALPHABET='ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe'
const SIGN_ALPHABET='Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe'
const CHECK_ORDER=[24,26,27,28,29,30,31,32,33,34,35,36,38,39,40,41,42,43,44,45,46,47,48,49,51,52,53,55,56,57,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,79,80,84,85]
const PACK_ORDER=[34,44,56,61,73,29,70,45,35,49,38,66,51,68,28,48,64,47,30,71,26,55,31,69,59,40,62,63,27,72,41,74,57,52,42,39,33,67,53,43,65,46,36,24,60,32,79,80,84,85]
const SCREEN=Buffer.from('1441|838|1441|913|1441|913|1441|961|Win32')
function encode(bytes,alphabet){return Buffer.from(bytes).toString('base64').replace(/[A-Za-z0-9+/]/g,c=>alphabet[BASE64.indexOf(c)])}
function permutation(forUA){
  const table=Array.from({length:256},(_,i)=>255-i);let state=0
  for(let i=0;i<256;i++){
    const value=table[i]
    const j=forUA?(state*value+state+[0,1,0][i%3])%256:(state+211)%256
    table[i]=table[j];table[j]=value
    state=forUA?j:table[i+1]*j+j
  }
  return table
}
function scramble(bytes,forUA){
  const table=permutation(forUA);let cursor=0
  return Array.from(bytes,(value,i)=>{
    const pos=(i+1)%256,a=table[pos];cursor=(cursor+a)%256
    const b=table[cursor];table[pos]=b;table[cursor]=a
    return value^table[(a+b)%256]
  })
}
function getABogus(query,ua,{now=Date.now,random=Math.random}={}){
  const integer=(min,max)=>Math.floor(random()*(max-min+1))+min
  const t1=now(),t2=now()-1+integer(1,3)
  const uaHash=digest(encode(scramble(Array.from(ua,c=>c.charCodeAt(0)),true),UA_ALPHABET))
  const t3=now()+integer(4,15),queryHash=digest(digest(query+'dhzx')),t4=now()+integer(100,1000)
  const suffix=Buffer.from(`${(t3+3)&255},`)
  const values={24:41,26:((t4-1721836800000)/1209600000)>>0,27:6,28:(t3-t1+3)&255,
    35:Math.floor(t3/2**40)&255,36:0,38:129,39:0,40:211,41:2,42:5,43:1,44:0,45:0,46:0,47:0,
    48:queryHash[9],49:queryHash[18],51:queryHash[3],52:82,53:177,55:44,
    56:uaHash[11],57:uaHash[21],59:uaHash[5],66:3,67:97,68:24,69:0,70:0,71:239,72:24,73:0,74:0,
    79:SCREEN.length,80:0,84:suffix.length,85:0}
  for(let i=0;i<6;i++){values[29+i]=Math.floor(t3/256**i)&255;values[60+i]=Math.floor(t2/256**i)&255}
  const seed=random()*65535,a=seed&255,b=(seed>>8)&255
  const c=((random()*240)>>0)+1,d=(((random()*255)>>0)&77)|2|16|32|128
  const head=[(a&170)|1,a&85,b&170,b&85,(c&170)|1,c&85,d&170,d&85]
  const check=[...head,...CHECK_ORDER.map(i=>values[i])].reduce((sum,n)=>sum^n,0)
  const packed=[...PACK_ORDER.map(i=>values[i]),...SCREEN,...suffix,check],tail=[]
  for(let i=0;i<94;i+=3){
    const noise=(random()*1000)&255,x=packed[i],y=packed[i+1],z=packed[i+2]
    tail.push((noise&145)|(x&110),(noise&66)|(y&189),(noise&44)|(z&211),(x&145)|(y&66)|(z&44))
  }
  const leadA=(random()*65535)&255,leadB=(random()*40)>>0
  return encode([(leadA&170)|1,(leadA&85)|2,(leadB&170)|80,(leadB&85)|2,...scramble([...head,...tail],false)],SIGN_ALPHABET)
}
function makeToken(){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=';return Array.from({length:184},()=>chars[randomInt(chars.length)]).join('')}
function buildAccountUrl(ua,{sign=getABogus,token=makeToken}={}){
  // Preserve dycast fetchMeInfo's parameter ordering and sign BEFORE adding tokens.
  const params=new URLSearchParams({aid:'6383',app_name:'douyin_web',browser_language:'zh-CN',browser_name:'Edge',browser_platform:'Win32',browser_version:'146.0.0.0',cookie_enabled:'true',device_platform:'web',enter_from:'web_live',language:'zh-CN',live_id:'1',os_name:'Windows',os_version:'10',room_id:'0',screen_height:'1080',screen_width:'1920'})
  const signature=sign(params.toString(),ua)
  params.set('msToken',token());params.set('a_bogus',signature)
  return `https://live.douyin.com/webcast/user/me/?${params}`
}
module.exports={getABogus,buildAccountUrl}
