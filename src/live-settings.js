// A single in-flight write and a single merged patch, regardless of input rate.
export function createLiveSettingsWriter({send,onResult=()=>{},notify=()=>{},schedule=setTimeout,cancel=clearTimeout,interval=160}){
 let pending=null,running=null,timer=null,disposed=false,error=''
 const state=()=>({saving:!!running,pending:!!pending,error})
 const publish=()=>{if(!disposed)notify(state())}
 const clear=()=>{if(timer!==null){cancel(timer);timer=null}}
 function run(){
  if(disposed||running||!pending||error)return running
  clear();const patch=pending;pending=null
  let request;try{request=send(patch)}catch(e){request=Promise.reject(e)}
  running=Promise.resolve(request).then(result=>{if(!disposed)onResult(result)},e=>{
   if(!disposed){pending={...patch,...pending};error=e.message||'设置应用失败，请重试。'}
  }).finally(()=>{
   running=null
   if(!disposed&&!error)timer=schedule(()=>{timer=null;run()},interval)
   publish()
  });publish();return running
 }
 async function flush(){
  clear()
  while(!disposed&&!error&&(pending||running)){await (running||run());clear()}
  return !disposed&&!error
 }
 return {state,update(patch){if(disposed||!Object.keys(patch).length)return;pending={...pending,...patch};error='';publish();if(!running&&timer===null)run()},flush,
  retry(){error='';publish();return flush()},dispose(){disposed=true;pending=null;clear()}}
}
