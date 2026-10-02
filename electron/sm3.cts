

// Portable SM3 (GB/T 32905). Electron's BoringSSL does not expose crypto SM3.
const rotate=(word:number,bits:number)=>(word<<(bits&31))|(word>>>(32-(bits&31)))
function sm3(input:string | Uint8Array){
  const bytes=Buffer.isBuffer(input)?input:Buffer.from(input)
  const padded=Buffer.alloc(Math.ceil((bytes.length+9)/64)*64)
  bytes.copy(padded);padded[bytes.length]=128;padded.writeBigUInt64BE(BigInt(bytes.length)*8n,padded.length-8)
  const state=new Uint32Array([0x7380166f,0x4914b2b9,0x172442d7,0xda8a0600,0xa96f30bc,0x163138aa,0xe38dee4d,0xb0fb0e4e])
  const words=new Uint32Array(68)
  for(let offset=0;offset<padded.length;offset+=64){
    for(let i=0;i<16;i++)words[i]=padded.readUInt32BE(offset+i*4)
    for(let i=16;i<68;i++){
      const x=words[i-16]^words[i-9]^rotate(words[i-3],15)
      words[i]=x^rotate(x,15)^rotate(x,23)^rotate(words[i-13],7)^words[i-6]
    }
    let [a,b,c,d,e,f,g,h]=state
    for(let round=0;round<64;round++){
      const ar=rotate(a,12),constant=round<16?0x79cc4519:0x7a879d8a
      const ss1=rotate((ar+e+rotate(constant,round))>>>0,7),ss2=ss1^ar
      const ff=round<16?a^b^c:(a&b)|(a&c)|(b&c)
      const gg=round<16?e^f^g:(e&f)|(~e&g)
      const t1=(ff+d+ss2+(words[round]^words[round+4]))>>>0
      const t2=(gg+h+ss1+words[round])>>>0
      d=c;c=rotate(b,9);b=a;a=t1;h=g;g=rotate(f,19);f=e;e=t2^rotate(t2,9)^rotate(t2,17)
    }
    const next=[a,b,c,d,e,f,g,h];for(let i=0;i<8;i++)state[i]^=next[i]
  }
  const result=Buffer.alloc(32);for(let i=0;i<8;i++)result.writeUInt32BE(state[i],i*4)
  return result
}
export {sm3};
