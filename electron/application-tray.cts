import type {BrowserWindow,Event,Menu,MenuItemConstructorOptions,Tray} from 'electron';
import type {DisplayKind} from './display-windows.cjs';

type MainWindow=Pick<BrowserWindow,'isDestroyed'|'isMinimized'|'restore'|'show'|'hide'|'focus'>;
type NativeTray=Pick<Tray,'on'|'removeListener'|'setToolTip'|'popUpContextMenu'|'isDestroyed'|'destroy'>;
interface TrayOptions {
  Tray:new(icon:string)=>NativeTray;
  Menu:Pick<typeof Menu,'buildFromTemplate'>;
  icon:string;
  title:string;
  getMainWindow:()=>MainWindow|null|undefined;
  isQuitting:()=>boolean;
  canOpenDisplay:(kind:DisplayKind)=>boolean;
  openDisplay:(kind:DisplayKind)=>Promise<unknown>;
  requestQuit:()=>void;
  onError:(error:unknown)=>void;
}

function createApplicationTray(options:TrayOptions){
  const tray=new options.Tray(options.icon);
  let disposed=false;
  const opening=new Set<DisplayKind>();
  const active=()=>!disposed&&!tray.isDestroyed()&&!options.isQuitting();
  function showMain(){
    if(!active())return false;
    const main=options.getMainWindow();
    if(!main||main.isDestroyed())return false;
    if(main.isMinimized())main.restore();
    main.show();main.focus();
    return true;
  }
  function hideOnClose(event:Pick<Event,'preventDefault'>){
    if(!active())return false;
    const main=options.getMainWindow();
    if(!main||main.isDestroyed())return false;
    event.preventDefault();main.hide();
    return true;
  }
  async function open(kind:DisplayKind){
    if(!active()||opening.has(kind)||!options.canOpenDisplay(kind))return;
    opening.add(kind);
    try{await options.openDisplay(kind)}
    catch(error){showMain();options.onError(error)}
    finally{opening.delete(kind)}
  }
  function showMenu(){
    if(!active())return;
    const items:MenuItemConstructorOptions[]=[
      {label:'打开主页面',click:()=>{showMain()}},
      {type:'separator'},
      {label:'弹幕弹窗',enabled:options.canOpenDisplay('messages'),click:async()=>{await open('messages')}},
      {label:'挑战弹窗',enabled:options.canOpenDisplay('challenge'),click:async()=>{await open('challenge')}},
      {type:'separator'},
      {label:'退出',click:()=>{if(active())options.requestQuit()}}
    ];
    tray.popUpContextMenu(options.Menu.buildFromTemplate(items));
  }
  const onClick=()=>{showMain()};
  try{
    tray.setToolTip(options.title);
    tray.on('click',onClick);
    tray.on('double-click',onClick);
    tray.on('right-click',showMenu);
  }catch(error){dispose();throw error}
  function dispose(){
    if(disposed)return;
    disposed=true;
    tray.removeListener('click',onClick);
    tray.removeListener('double-click',onClick);
    tray.removeListener('right-click',showMenu);
    if(!tray.isDestroyed())tray.destroy();
  }
  return {showMain,hideOnClose,dispose};
}
export {createApplicationTray};
