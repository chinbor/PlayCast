const fs=require('node:fs/promises')
const os=require('node:os')
const path=require('node:path')
const {spawn}=require('node:child_process')

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(read,label,timeout=20000){
  const deadline=Date.now()+timeout
  let last
  while(Date.now()<deadline){try{const value=await read();if(value)return value}catch(error){last=error}await pause(40)}
  throw Error(`${label} timed out${last?`: ${last.message}`:''}`)
}
async function connect(url){
  const socket=new WebSocket(url),pending=new Map()
  let sequence=0
  socket.addEventListener('message',event=>{
    const value=JSON.parse(event.data)
    const task=pending.get(value.id)
    if(task){pending.delete(value.id);clearTimeout(task.timer);value.error?task.reject(Error(value.error.message)):task.resolve(value.result)}
  })
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`))},10000)
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))
  })
  return {send,async evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value},close(){for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('CDP closed'))}pending.clear();socket.close()}}
}
function summarize(values){
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length
  if(n===0)return {samples:0,medianMs:null,p95Ms:null}
  return {samples:n,medianMs:Math.round((n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2)*100)/100,p95Ms:Math.round(sorted[Math.max(0,Math.ceil(n*.95)-1)]*100)/100}
}
async function sample(executable,profile){
  await fs.mkdir(profile,{recursive:true})
  const portFile=path.join(profile,'DevToolsActivePort')
  await fs.rm(portFile,{force:true})
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE
  const start=Date.now()
  const child=spawn(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{cwd:path.dirname(profile),env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']})
  let ended=false,diagnostics=''
  const exit=new Promise(resolve=>{child.once('exit',(code,signal)=>{ended=true;resolve({code,signal})});child.once('error',error=>{ended=true;resolve({error})})})
  const record=chunk=>{diagnostics=(diagnostics+chunk.toString()).slice(-4000)}
  child.stdout.on('data',record);child.stderr.on('data',record)
  let page
  try{
    const port=await until(async()=>{if(ended)throw Error(`App exited: ${diagnostics}`);try{return Number((await fs.readFile(portFile,'utf8')).split('\n')[0])}catch{return false}},'debug port')
    const target=await until(async()=>{const result=await fetch(`http://127.0.0.1:${port}/json/list`);return (await result.json()).find(value=>value.type==='page'&&value.url.includes('/dist/index.html')&&!value.url.includes('#'))},'main window')
    page=await connect(target.webSocketDebuggerUrl)
    await until(()=>page.evaluate('!!document.querySelector("[data-testid=setup-platform-douyin], [data-testid=setup-login]")'),'onboarding')
    const launchToOnboardingObservedMs=Date.now()-start
    const timing=await page.evaluate('(()=>{const nav=performance.getEntriesByType("navigation")[0];const paint=performance.getEntriesByName("first-contentful-paint")[0];return {origin:performance.timeOrigin,domReady:nav.domContentLoadedEventEnd,fcp:paint?.startTime??null}})()')
    const click=await page.evaluate('new Promise(resolve=>{const button=document.querySelector("[data-testid=setup-platform-douyin]");if(!button){resolve(null);return}const start=performance.now();const observer=new MutationObserver(()=>{if(document.querySelector("[data-testid=setup-login]")){observer.disconnect();resolve(performance.now()-start)}});observer.observe(document.body,{subtree:true,childList:true});button.click()})')
    return {launchToDOMReadyMs:timing.origin-start+timing.domReady,launchToFirstContentfulPaintMs:timing.fcp===null?null:timing.origin-start+timing.fcp,launchToOnboardingObservedMs,onboardingClickToDOMMs:click}
  }finally{
    if(page){try{await page.send('Page.close')}catch{}page.close()}
    if(!ended){const result=await Promise.race([exit,pause(12000).then(()=>null)]);if(!result){child.kill();await exit;throw Error('Benchmark app did not exit gracefully')}}
  }
}
async function run(){
  const executable=path.resolve(process.argv[2]||'release/win-unpacked/PlayCast.exe')
  const samples=Number(process.argv[3]||5),reportPath=process.argv[4]
  const profileMode=process.argv[5]||'fresh'
  if(!['fresh','warm'].includes(profileMode))throw Error('Profile mode must be fresh or warm')
  if(!Number.isSafeInteger(samples)||samples<1||samples>30)throw Error('Sample count must be 1–30')
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'playcast-benchmark-'))
  const results=[]
  if(profileMode==='warm')await sample(executable,path.join(temporary,'warm'))
  for(let index=0;index<samples;index++){
    const result=await sample(executable,path.join(temporary,profileMode==='warm'?'warm':`fresh-${index}`));results.push(result)
    console.log(`Sample ${index+1}/${samples}:`,JSON.stringify(result))
  }
  const summary=Object.fromEntries(Object.keys(results[0]).map(key=>[key,summarize(results.map(value=>value[key]).filter(value=>value!==null))]))
  const report={executable,recordedAt:new Date().toISOString(),profileMode,method:`${profileMode==='warm'?'Reused isolated profile after one excluded warmup launch':'Fresh isolated profiles'}; OS file cache is not reset. CDP enabled for observation. Onboarding observation includes CDP attachment and polling overhead, with no artificial delay subtracted. Click latency measures DOM availability, not compositor presentation. No real account or room is connected.`,results,summary}
  if(reportPath){await fs.mkdir(path.dirname(path.resolve(reportPath)),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n')}
  console.log(JSON.stringify(report,null,2))
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={summarize}
