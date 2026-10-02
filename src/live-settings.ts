import {errorMessage} from './renderer-types'
// A single in-flight write and a single merged patch, regardless of input rate.
export function createLiveSettingsWriter<P extends object,R>({send,onResult=()=>{},notify=()=>{},schedule=setTimeout,cancel=clearTimeout,interval=160}:{send:(patch:Partial<P>)=>Promise<R>|R;onResult?:(result:R)=>void;notify?:(state:{saving:boolean;pending:boolean;error:string})=>void;schedule?:typeof setTimeout;cancel?:typeof clearTimeout;interval?:number}){
 let pending:Partial<P>|null=null,running:Promise<void>|null=null,timer:ReturnType<typeof setTimeout>|null=null,disposed=false,error=''
 const state=()=>({saving:!!running,pending:!!pending,error})
 const publish=()=>{if(!disposed)notify(state())}
 const clear=()=>{if(timer!==null){cancel(timer);timer=null}}
 function run(){
  if(disposed||running||!pending||error)return running
  clear();const patch=pending;pending=null
  let request;try{request=send(patch)}catch(e){request=Promise.reject(e)}
  running=Promise.resolve(request).then(result=>{if(!disposed)onResult(result)},e=>{
   if(!disposed){pending={...patch,...pending};error=errorMessage(e)||'设置应用失败，请重试。'}
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
 return {state,update(patch:Partial<P>){if(disposed||!Object.keys(patch).length)return;pending={...pending,...patch};error='';publish();if(!running&&timer===null)run()},flush,
  retry(){error='';publish();return flush()},dispose(){disposed=true;pending=null;clear()}}
}
