import type {App} from 'electron';
type RuntimeApp=Pick<App,'isPackaged'|'commandLine'|'getPath'|'setPath'|'userAgentFallback'|'setName'|'setAppUserModelId'>;
import fs from 'node:fs';
import path from 'node:path';
import {title as APP_TITLE} from '../app-brand.json';



// Public branding must never rename the established account/challenge profile.
// Keep Chromium's standard explicit profile switch for isolated diagnostics.
function configureRuntime(app:RuntimeApp,{argv=process.argv,pid=process.pid}={}){
 const development=!app.isPackaged&&argv.includes('--dev')
 const smoke=!app.isPackaged&&argv.includes('--smoke')
 const liveProbe=app.isPackaged?undefined:argv.find(a=>a.startsWith('--probe-room='))
 const custom=app.commandLine?.getSwitchValue('user-data-dir')||''
 if(custom&&!path.isAbsolute(custom))throw Error('user-data-dir must be an absolute path')
 const directory=smoke||liveProbe?path.join(app.getPath('temp'),`lit-test-${pid}`):custom||path.join(app.getPath('appData'),'live-interaction-tool')
 fs.mkdirSync(directory,{recursive:true})
 app.setPath('userData',directory)
 app.setPath('sessionData',directory)
 // Native JavaScript dialogs use app.name, not BrowserWindow.title. Pin the
 // existing profile first so public branding cannot relocate saved user data.
 const networkUserAgent=app.userAgentFallback
 app.setName(APP_TITLE)
 // Electron also derives its default HTTP user agent from app.name. Keep the
 // original ASCII identifier: a localized header breaks protocol image loading.
 app.userAgentFallback=networkUserAgent
 app.setAppUserModelId?.('com.playcast.desktop')
 return {development,smoke,liveProbe}
}
export {configureRuntime};
