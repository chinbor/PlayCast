import {useLayoutEffect,useRef,useState} from 'react'
import {createDisplayFeedController,emptyDisplayFeed,subscribeFeedVisibility} from './display-feed'

// One controller per mounted reader. No timers, global cache, or queued requests.
export function useMessageFeed({api,scope,version,active=true,request,nativeVisibility=false}){
 const [feed,setFeed]=useState(emptyDisplayFeed),controller=useRef(null),latest=useRef(request)
 latest.current=request
 useLayoutEffect(()=>{
  const reader=createDisplayFeedController({request:(cursor,captured)=>latest.current(cursor,captured),onChange:setFeed})
  controller.current=reader;reader.setActive(false)
  return()=>{reader.dispose();controller.current=null}
 },[api])
 useLayoutEffect(()=>{controller.current?.setActive(false);controller.current?.setScope(scope)},[api,scope])
 useLayoutEffect(()=>{controller.current?.markDirty(version)},[api,version])
 useLayoutEffect(()=>{
  const off=subscribeFeedVisibility({api,document,nativeVisibility,active,onChange:value=>controller.current?.setActive(value)})
  return()=>{off();controller.current?.setActive(false)}
 },[api,scope,active,nativeVisibility])
 return {feed:feed.contextVersion===scope?feed:{...emptyDisplayFeed(),contextVersion:scope},retry:()=>controller.current?.retry()}
}
