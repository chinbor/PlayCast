const STAGES=new Set(['decode','frame','processing'])
const CODES=new Set(['ERR_INVALID_ARG_TYPE','Z_DATA_ERROR','Z_BUF_ERROR','UNKNOWN'])
function createDiagnostics(){
  const entries=[]
  const methods=new Map()
  let otherCount=0
  const increment=value=>Math.min(Number.MAX_SAFE_INTEGER,value+1)
  return {
    recordUnsupported(value){
      const method=typeof value==='string'&&/^Webcast[A-Za-z0-9]{1,64}Message$/.test(value)?value:'unknown'
      if(methods.has(method))methods.set(method,increment(methods.get(method)))
      else if(methods.size<50)methods.set(method,1)
      else otherCount=increment(otherCount)
    },
    unsupported(){const items=[...methods].map(([method,count])=>({method,count})).sort((a,b)=>b.count-a.count);return {items,otherCount,total:Math.min(Number.MAX_SAFE_INTEGER,items.reduce((n,item)=>n+item.count,otherCount)),limit:50}},
    record({method,stage,error,payloadSize}={}){
      entries.push({
        method:typeof method==='string' && /^Webcast[A-Za-z0-9]{1,64}Message$/.test(method)?method:'unknown',
        stage:STAGES.has(stage)?stage:'unknown',
        code:CODES.has(error?.code)?error.code:'UNKNOWN',
        timestamp:Date.now(),
        payloadSize:Number.isSafeInteger(payloadSize)&&payloadSize>=0&&payloadSize<=8*1024*1024?payloadSize:0
      })
      if(entries.length>50)entries.shift()
    },
    snapshot:()=>entries.map(entry=>({...entry})),
    clear:()=>{entries.length=0;methods.clear();otherCount=0}
  }
}
module.exports={createDiagnostics}
