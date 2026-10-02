interface DiagnosticInput {method?:unknown;stage?:unknown;error?:unknown;payloadSize?:unknown}
interface DiagnosticEntry {method:string;stage:string;code:string;timestamp:number;payloadSize:number}

const STAGES=new Set(['decode','frame','processing'])
const CODES=new Set(['ERR_INVALID_ARG_TYPE','Z_DATA_ERROR','Z_BUF_ERROR','UNKNOWN'])
function createDiagnostics(){
  const entries:DiagnosticEntry[]=[]
  const methods=new Map<string,number>()
  let otherCount=0
  const increment=(value:number)=>Math.min(Number.MAX_SAFE_INTEGER,value+1)
  return {
    recordUnsupported(value:unknown){
      const method=typeof value==='string'&&/^Webcast[A-Za-z0-9]{1,64}Message$/.test(value)?value:'unknown'
      if(methods.has(method))methods.set(method,increment(methods.get(method)!))
      else if(methods.size<50)methods.set(method,1)
      else otherCount=increment(otherCount)
    },
    unsupported(){const items=[...methods].map(([method,count])=>({method,count})).sort((a,b)=>b.count-a.count);return {items,otherCount,total:Math.min(Number.MAX_SAFE_INTEGER,items.reduce((n,item)=>n+item.count,otherCount)),limit:50}},
    record({method,stage,error,payloadSize}:DiagnosticInput={}){
      entries.push({
        method:typeof method==='string' && /^Webcast[A-Za-z0-9]{1,64}Message$/.test(method)?method:'unknown',
        stage:typeof stage==='string'&&STAGES.has(stage)?stage:'unknown',
        code:error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&CODES.has(error.code)?error.code:'UNKNOWN',
        timestamp:Date.now(),
        payloadSize:typeof payloadSize==='number'&&Number.isSafeInteger(payloadSize)&&payloadSize>=0&&payloadSize<=8*1024*1024?payloadSize:0
      })
      if(entries.length>50)entries.shift()
    },
    snapshot:()=>entries.map(entry=>({...entry})),
    clear:()=>{entries.length=0;methods.clear();otherCount=0}
  }
}
export {createDiagnostics};
