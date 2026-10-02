/* Runs before CSS and React, under the existing script-src 'self' policy. */
;(function(){
 if(['#overlay','#messages-overlay','#challenge-settings','#messages-settings'].includes(location.hash))return
 var theme=window.liveTool&&window.liveTool.initialAppearance
 if(!theme){
  var mode:import('../../shared/ipc').AppearanceMode='system'
  try{var saved=window.localStorage.getItem('playcast-main-theme');if(saved==='system'||saved==='light'||saved==='dark')mode=saved}catch(e){}
  theme={revision:0,mode:mode,resolved:mode==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode}
 }
 var root=document.documentElement
 root.dataset.mainTheme=theme.resolved
 root.style.colorScheme=theme.resolved
 root.style.backgroundColor=theme.resolved==='dark'?'#19191c':'#faf8f5'
})()
