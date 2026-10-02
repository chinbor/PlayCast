const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {createApplicationTray}=require('../electron/application-tray.cjs')
function fixture(){
 const native=[],calls={opened:[],quit:0,errors:[]},state={quitting:false,allowed:true}
 const main={visible:true,minimized:false,dead:false,isDestroyed(){return this.dead},isMinimized(){return this.minimized},restore(){this.minimized=false},show(){this.visible=true},hide(){this.visible=false},focus(){calls.focus=(calls.focus||0)+1}}
 class Tray extends EventEmitter{constructor(icon){super();this.icon=icon;native.push(this)}setToolTip(value){this.tooltip=value}popUpContextMenu(menu){this.menu=menu}isDestroyed(){return !!this.dead}destroy(){this.dead=true;calls.destroy=(calls.destroy||0)+1}}
 const controller=createApplicationTray({Tray,Menu:{buildFromTemplate:items=>({items})},icon:'playcast.ico',title:'玩播 · PlayCast',getMainWindow:()=>main,isQuitting:()=>state.quitting,canOpenDisplay:()=>state.allowed,openDisplay:async kind=>{calls.opened.push(kind);if(state.error)throw Error('打开失败')},requestQuit:()=>calls.quit++,onError:error=>calls.errors.push(error.message)})
 return {controller,tray:native[0],main,calls,state,menu(){native[0].emit('right-click');return native[0].menu.items},close(){const event={preventDefault(){this.prevented=true}};const handled=controller.hideOnClose(event);return {event,handled}}}
}
test('closing hides a living main window, and tray click restores and focuses it',()=>{
 const f=fixture();assert.equal(f.tray.icon,'playcast.ico');assert.match(f.tray.tooltip,/PlayCast/)
 const {event,handled}=f.close();assert.equal(handled,true);assert.equal(event.prevented,true);assert.equal(f.main.visible,false);assert.equal(f.calls.quit,0)
 f.main.minimized=true;f.tray.emit('click');assert.equal(f.main.visible,true);assert.equal(f.main.minimized,false);assert.equal(f.calls.focus,1)
 f.tray.emit('double-click');assert.equal(f.calls.focus,2)
})
test('tray menu opens both displays through the shared product actions and explicitly requests quit',async()=>{
 const f=fixture(),items=f.menu();assert.deepEqual(items.filter(item=>item.label).map(item=>item.label),['打开主页面','弹幕弹窗','挑战弹窗','退出'])
 await items.find(item=>item.label==='弹幕弹窗').click();await items.find(item=>item.label==='挑战弹窗').click()
 assert.deepEqual(f.calls.opened,['messages','challenge']);assert.equal(f.calls.quit,0)
 items.find(item=>item.label==='退出').click();assert.equal(f.calls.quit,1);assert.equal(f.tray.isDestroyed(),false)
})
test('menu availability is refreshed and stale clicks cannot bypass capability checks',async()=>{
 const f=fixture(),previous=f.menu();f.state.allowed=false
 await previous.find(item=>item.label==='弹幕弹窗').click();assert.deepEqual(f.calls.opened,[])
 const items=f.menu();assert.equal(items.find(item=>item.label==='弹幕弹窗').enabled,false);assert.equal(items.find(item=>item.label==='挑战弹窗').enabled,false)
 assert.notEqual(items.find(item=>item.label==='退出').enabled,false)
})
test('a failed display open is handled and restores the main window',async()=>{
 const f=fixture();f.close();f.state.error=true
 await f.menu().find(item=>item.label==='挑战弹窗').click()
 assert.deepEqual(f.calls.errors,['打开失败']);assert.equal(f.main.visible,true);assert.equal(f.calls.quit,0)
})
test('approved quitting bypasses hide and suppresses further tray actions',async()=>{
 const f=fixture(),items=f.menu();f.state.quitting=true
 assert.equal(f.close().handled,false);f.tray.emit('click');await items.find(item=>item.label==='弹幕弹窗').click()
 assert.equal(f.calls.focus,undefined);assert.deepEqual(f.calls.opened,[])
})
test('disposing removes tray listeners, destroys the icon once and allows close fallback',()=>{
 const f=fixture();f.controller.dispose();f.controller.dispose()
 assert.equal(f.calls.destroy,1);assert.equal(f.tray.listenerCount('click'),0);assert.equal(f.tray.listenerCount('right-click'),0)
 assert.equal(f.close().handled,false);assert.equal(f.close().event.prevented,undefined)
})

test('partial tray initialization failure destroys the icon before falling back',()=>{
 let destroyed=0
 class Tray extends EventEmitter{setToolTip(){throw Error('Tooltip unavailable')}isDestroyed(){return false}destroy(){destroyed++}}
 assert.throws(()=>createApplicationTray({Tray,icon:'playcast.ico',title:'PlayCast'}),/Tooltip unavailable/)
 assert.equal(destroyed,1)
})
