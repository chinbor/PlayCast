

import type {CSSProperties,KeyboardEvent,ButtonHTMLAttributes} from 'react'
import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import Icon from './Icons'

export function optionIndex(options:readonly {disabled?:boolean}[],active:number,key:string){
  if(!options.length)return -1
  const direction=key==='End'||key==='ArrowUp'?-1:1
  let index=key==='Home'?0:key==='End'?options.length-1:(active+direction+options.length)%options.length
  for(let count=0;count<options.length;count++,index=(index+direction+options.length)%options.length)if(!options[index].disabled)return index
  return -1
}

export default function Select({value,options,onChange,label,disabled=false,error=false,...props}:Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onChange'|'value'>&{value:string;options:readonly {value:string;label:string;disabled?:boolean}[];onChange:(value:string)=>void;label:string;error?:boolean}){
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),typed=useRef({text:'',at:0})
  const [open,setOpen]=useState(false),[active,setActive]=useState(0),[position,setPosition]=useState<CSSProperties>({})
  const selected=options.findIndex(o=>o.value===value)
  function close(focus=false){setOpen(false);if(focus)trigger.current?.focus()}
  function show(){if(disabled)return;const index=selected>=0&&!options[selected].disabled?selected:optionIndex(options,0,'Home');if(index<0)return;setActive(index);setOpen(true)}
  function choose(index:number){if(!options[index]||options[index].disabled)return;onChange(options[index].value);close(true)}
  useLayoutEffect(()=>{if(!open)return;function place(){const r=trigger.current!.getBoundingClientRect(),below=innerHeight-r.bottom-12,above=r.top-12,up=below<180&&above>below;setPosition({position:'fixed',left:Math.max(8,Math.min(r.left,innerWidth-Math.max(r.width,190)-8)),width:Math.min(Math.max(r.width,190),innerWidth-16),maxHeight:Math.min(300,up?above:below),...(up?{bottom:innerHeight-r.top+6}:{top:r.bottom+6})})}place();addEventListener('resize',place);addEventListener('scroll',place,true);return()=>{removeEventListener('resize',place);removeEventListener('scroll',place,true)}},[open])
  useEffect(()=>{if(!open)return;function outside(e:PointerEvent){if(!trigger.current?.contains(e.target as Node|null)&&!menu.current?.contains(e.target as Node|null))close()}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open])
  useEffect(()=>{if(open)menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'})},[active,open])
  function key(e:KeyboardEvent<HTMLButtonElement>){
    if(e.key==='Tab'){close();return}
    if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close(true);return}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(!open){show();return}const next=optionIndex(options,active,e.key);if(next>=0)setActive(next);return}
    if(e.key==='Enter'||e.key===' '){e.preventDefault();open?choose(active):show();return}
    if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();const now=Date.now();typed.current={text:(now-typed.current.at<650?typed.current.text:'')+e.key.toLowerCase(),at:now};const index=options.findIndex(o=>!o.disabled&&o.label.toLowerCase().startsWith(typed.current.text));if(index>=0){if(!open)setOpen(true);setActive(index)}}
  }
  return <><button {...props} ref={trigger} type="button" className="custom-select" role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-haspopup="listbox" aria-activedescendant={open?`${id}-${active}`:undefined} aria-invalid={error||undefined} disabled={disabled} onKeyDown={key} onClick={()=>open?close():show()}>{options[selected]?.label||'请选择'}<Icon name="down" size={16}/></button>{open&&createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="select-menu" style={position}>{options.map((o,i)=><div id={`${id}-${i}`} key={o.value} role="option" aria-selected={o.value===value} aria-disabled={o.disabled||undefined} data-value={o.value} data-index={i} className={active===i?'focused':''} onPointerMove={()=>!o.disabled&&setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(i)}><span>{o.label}</span>{o.value===value&&<span aria-hidden="true">✓</span>}</div>)}</div>,trigger.current?.closest('dialog')||document.body)}</>
}
