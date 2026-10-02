import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

export function validateRelease(ref,version){
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))throw Error('Invalid package version')
  if(!ref?.startsWith('refs/tags/'))return false
  const tag=ref.slice('refs/tags/'.length)
  if(tag!==`v${version}`)throw Error(`Release tag ${tag} does not match package version v${version}`)
  return true
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
  const tagged=validateRelease(process.env.GITHUB_REF,manifest.version)
  console.log(tagged?`Validated release v${manifest.version}`:'Manual/local build: artifacts only; no automatic release')
}
