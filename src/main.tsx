import {createRoot} from 'react-dom/client'
import type {LiveTool, DisplayKind} from '../shared/ipc'
const displayKind:DisplayKind|null=location.hash==='#overlay'?'challenge':location.hash==='#messages-overlay'?'messages':null
const settingsKind:DisplayKind|null=location.hash==='#challenge-settings'?'challenge':location.hash==='#messages-settings'?'messages':null
document.documentElement.classList.toggle('overlay-document',!!displayKind)
document.documentElement.classList.toggle('config-document',!!settingsKind)
const host=document.getElementById('root')
if(!host)throw Error('Application root is missing')
const root=createRoot(host)
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount())
async function mount(api:LiveTool|undefined,preview=false){
 if(settingsKind){const {default:Window}=await import('./entries/settings');root.render(<Window api={api} kind={settingsKind}/>)}
 else if(displayKind){const {default:Window}=await import('./entries/display');root.render(<Window api={api} kind={displayKind}/>)}
 else {const {default:Workspace}=await import('./entries/workspace');root.render(<Workspace api={api} preview={preview}/>)}
}
if(import.meta.env.DEV&&!window.liveTool)import('./browser-preview').then(({createPreview})=>mount(createPreview(displayKind),true))
else void mount(window.liveTool)
