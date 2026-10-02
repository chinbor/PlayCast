import type {MessageSettings,OverlaySettings} from '../shared/domain'
import {MESSAGE_TYPES} from './display-feed'
export const themes=[
  {id:'cream',name:'召唤师峡谷',note:'默认 · 森林与符文'},
  {id:'forest',name:'艾欧尼亚',note:'粉樱 · 灵境群山'},
  {id:'champion',name:'德玛西亚',note:'香槟金 · 荣耀之城'},
  {id:'arcade',name:'皮尔特沃夫',note:'冰蓝 · 海克斯科技'},
]
export const messageCategories={comment:['评论','chat','条'],like:['点赞','heart','个'],enter:['进场','enter','次'],follow:['关注','follow','次'],gift:['礼物','gift','个']}
export const messageDefaults:MessageSettings={theme:'dark',backgroundTransparency:0,width:320,height:480,alwaysOnTop:true,pure:true,showOnline:true,enabledTypes:MESSAGE_TYPES}
export const challengeDefaults:OverlaySettings={theme:'cream',title:'',pure:true,alwaysOnTop:true,animations:true,width:320,height:480,layoutVersion:3,backgroundTransparency:0}
