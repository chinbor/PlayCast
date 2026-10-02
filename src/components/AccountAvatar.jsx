import {useState} from 'react'
import Icon from './Icons'

export default function AccountAvatar({src,name,compact=false}){
  const [failed,setFailed]=useState(false)
  return <span className={`account-avatar${compact?' account-avatar-compact':''}`}>
    {src&&!failed?<img src={src} alt={`${name||'账号'}的头像`} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<Icon name="user" size={compact?18:32}/>}
  </span>
}
