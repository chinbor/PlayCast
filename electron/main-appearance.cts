import type {NativeTheme} from 'electron';
export type AppearanceMode='system'|'light'|'dark';
export interface AppearanceState {mode:AppearanceMode;resolved:'light'|'dark';revision:number}
interface AppearanceOptions {directory:string;nativeTheme:Pick<NativeTheme,'shouldUseDarkColors'|'on'|'removeListener'>;onChange?:(state:AppearanceState)=>void}
import fs from 'node:fs';
import path from 'node:path';

const MODES=new Set(['system','light','dark'])
function createMainAppearance({directory,nativeTheme,onChange=()=>{}}:AppearanceOptions){
 const file=path.join(directory,'appearance.json')
 let mode:AppearanceMode='system',revision=0,suspended=false;let pending:Promise<AppearanceState>|null=null
 try{if(fs.statSync(file).size<=1024){const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version===1&&MODES.has(saved.mode))mode=saved.mode}}catch{}
 const resolve=():'light'|'dark'=>mode==='system'?(nativeTheme.shouldUseDarkColors?'dark':'light'):mode
 let resolved=resolve()
 const snapshot=()=>({mode,resolved,revision})
 function publish(){resolved=resolve();revision++;onChange(snapshot())}
 function systemChanged(){if(mode==='system'&&resolved!==resolve())publish()}
 nativeTheme.on('updated',systemChanged)
 async function set(next:AppearanceMode){
  if(!MODES.has(next))throw Error('无效的主题选项')
  if(suspended)throw Error('应用正在重置或关闭')
  if(pending)throw Error('主题正在保存，请稍候')
  // Also persist an explicit first choice of "system"; system notifications never write.
  pending=(async()=>{
   const handle=await fs.promises.open(file+'.tmp','w',0o600)
   try{await handle.writeFile(JSON.stringify({version:1,mode:next})+'\n');await handle.sync()}finally{await handle.close()}
   await fs.promises.rename(file+'.tmp',file)
   mode=next;publish();return snapshot()
  })()
  try{return await pending}finally{pending=null}
 }
 const flush=()=>pending?.catch(()=>{})||Promise.resolve()
 return {snapshot,set,flush,async suspend(){suspended=true;await flush()},reset(){mode='system';suspended=false;publish()},dispose(){suspended=true;nativeTheme.removeListener('updated',systemChanged)}}
}
export {createMainAppearance};
