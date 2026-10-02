import {readdir,stat,readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {listPackage,statFile} from '@electron/asar'

async function filesIn(directory){
  const entries=await readdir(directory,{withFileTypes:true})
  const nested=await Promise.all(entries.map(async entry=>{
    const filename=path.join(directory,entry.name)
    return entry.isDirectory()?filesIn(filename):[{path:filename,bytes:(await stat(filename)).size}]
  }))
  return nested.flat()
}
export async function collectPackageReport(unpacked){
  const files=await filesIn(unpacked)
  const archive=path.join(unpacked,'resources/app.asar')
  const entries=listPackage(archive).map(name=>name.replaceAll('\\','/').replace(/^\//,''))
  const groups={}
  for(const name of entries){
    const entry=statFile(archive,name.replaceAll('/',path.sep))
    if(entry.files)continue
    const pieces=name.split('/'),group=pieces[0]==='node_modules'?pieces.slice(0,2).join('/'):pieces[0]
    groups[group]=(groups[group]||0)+(entry.size||0)
  }
  const locales=files.filter(file=>path.dirname(file.path)===path.join(unpacked,'locales')).map(file=>({name:path.basename(file.path),bytes:file.bytes}))
  const forbiddenEntries=entries.filter(name=>/^(src|tests|artwork|docs|accounts|local-store|\.review|\.superpowers)(\/|$)/.test(name)||/^node_modules\/(react|react-dom|scheduler|typescript|esbuild)(\/|$)/.test(name)||/\.(cts|tsx?|map)$/.test(name))
  const notices={electron:files.some(file=>path.basename(file.path)==='LICENSE.electron.txt'&&file.bytes>0),chromium:files.some(file=>path.basename(file.path)==='LICENSES.chromium.html'&&file.bytes>0),project:entries.includes('LICENSE'),thirdParty:entries.includes('THIRD_PARTY_NOTICES.md'),ws:entries.includes('node_modules/ws/LICENSE')}
  return {unpackedBytes:files.reduce((sum,file)=>sum+file.bytes,0),executableBytes:files.find(file=>path.basename(file.path)==='PlayCast.exe')?.bytes??0,asarBytes:(await stat(archive)).size,asarGroups:groups,localeBytes:locales.reduce((sum,file)=>sum+file.bytes,0),locales,entries:entries.length,forbiddenEntries,notices}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
  const report=await collectPackageReport(path.resolve(process.argv[3]||path.join(root,'release/win-unpacked')))
  const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'))
  report.version=manifest.version
  report.installers=await Promise.all((await readdir(path.join(root,'release'))).filter(name=>name.startsWith(`PlayCast-Setup-${manifest.version}-`)&&name.endsWith('.exe')).map(async name=>({name,bytes:(await stat(path.join(root,'release',name))).size})))
  if(process.argv[2]){const output=path.resolve(process.argv[2]);await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n')}
  console.log(JSON.stringify(report,null,2))
  if(report.forbiddenEntries.length)throw Error('Package includes development sources/dependencies; see report')
  if(Object.values(report.notices).some(present=>!present))throw Error('Package is missing required license notices; see report')
  const actual=report.locales.map(value=>value.name).sort(),expected=['en-US.pak','zh-CN.pak','zh-TW.pak'].sort()
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Package locale set differs from the approved language set')
}
