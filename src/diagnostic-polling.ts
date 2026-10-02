// One pending request and one timer, independent of incoming message volume.
export function createDiagnosticPoller<T>({request,receive,error,schedule=setTimeout,cancel=clearTimeout,interval=2000}:{request:()=>Promise<T>;receive:(value:T)=>void;error:(error:unknown)=>void;schedule?:typeof setTimeout;cancel?:typeof clearTimeout;interval?:number}){
 let active=false,disposed=false,inFlight=false,timer:ReturnType<typeof setTimeout>|null=null,epoch=0,dirty=false
 const clear=()=>{if(timer!==null){cancel(timer);timer=null}}
 async function run(){
  clear();if(!active||disposed)return;if(inFlight){dirty=true;return}
  inFlight=true;dirty=false;const ticket=epoch
  try{const data=await request();if(!disposed&&active&&ticket===epoch)receive(data)}
  catch(e){if(!disposed&&active&&ticket===epoch)error(e)}
  finally{inFlight=false;if(!disposed&&active){timer=schedule(()=>{timer=null;run()},dirty?0:interval)}}
 }
 return {setActive(next:boolean){if(disposed||active===next)return;active=next;epoch++;clear();if(active)run()},refresh(){if(!disposed&&active)run()},dispose(){disposed=true;active=false;epoch++;clear()}}
}
