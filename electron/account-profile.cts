import type {AccountProfile} from '../shared/domain.js';
import {isObject,asObject,first} from './json-boundary.cjs';

const text=(value:unknown,max=200)=>typeof value==='string'?value.slice(0,max):''
const identifier=(value:unknown)=>typeof value==='string'?value.slice(0,200):typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value):''
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null
function safeImage(value:unknown){
  try{const u=new URL(typeof value==='string'?value:'');return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}
}
function parseDouyinProfile(input:unknown):AccountProfile|null{
  if(!isObject(input)||input.status_code!==0||!isObject(input.data))return null
  const d=input.data,id=identifier(d.sec_uid)||identifier(d.id_str)||identifier(d.id)
  if(!id)return null
  return {id,displayId:identifier(d.display_id),nickname:text(d.nickname),signature:text(d.signature,1000),
    avatar:safeImage(first(asObject(d.avatar_medium).url_list)||first(asObject(d.avatar_thumb).url_list)),
    followerCount:count(asObject(d.follow_info).follower_count),followingCount:count(asObject(d.follow_info).following_count)}
}
export {parseDouyinProfile};
