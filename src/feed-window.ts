export function feedWindow(count:number,scrollTop:number,height:number){
  const top=Math.min(Math.max(0,count*64-height),Math.max(0,scrollTop))
  return {start:Math.max(0,Math.floor(top/64)-4),end:Math.min(count,Math.ceil((top+height)/64)+4)}
}
