

import type {ReactNode} from 'react'
import { useEffect, useRef } from 'react'
import Icon from './Icons'
export default function Modal({ title, onClose, children, wide = false }:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous } }, [])
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby="modal-title" onCancel={e=>{e.preventDefault();onClose()}} onClick={e => { if (e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose() } }}><header className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><Icon name="close"/></button></header>{children}</dialog>
}
