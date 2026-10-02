export function countLabel(value){
  if(!Number.isFinite(value))return {text:'—',exact:'未提供',width:1}
  const exact=value.toLocaleString('zh-CN'),absolute=Math.abs(value)
  const unit=absolute>=1e12?[1e12,'万亿']:absolute>=1e8?[1e8,'亿']:absolute>=1e5?[1e4,'万']:null
  const text=unit?`${Math.trunc(value/unit[0]*10)/10}${unit[1]}`:String(value)
  const width=[...text].reduce((sum,char)=>sum+(/[万亿]/.test(char)?1:.65),0)
  return {text,exact,width:Math.max(1,width)}
}
export default function CountValue({value}){
  const {text,exact,width}=countLabel(value)
  return <span className="count-value" style={{'--number-width':width}} title={`完整数值：${exact}`} aria-label={exact}>{text}</span>
}
