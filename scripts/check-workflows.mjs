import {readFile} from 'node:fs/promises'
import {parseDocument} from 'yaml'

for(const file of ['ci.yml','release.yml']){
  const document=parseDocument(await readFile(new URL(`../.github/workflows/${file}`,import.meta.url),'utf8'),{uniqueKeys:true})
  if(document.errors.length)throw Error(`${file}: ${document.errors.map(error=>error.message).join('; ')}`)
  const workflow=document.toJS()
  if(workflow.permissions?.contents!=='read')throw Error(`${file}: default token must be read-only`)
  if(!workflow.on||!workflow.jobs)throw Error(`${file}: missing triggers/jobs`)
  for(const [name,job] of Object.entries(workflow.jobs)){
    if(!job['runs-on']||!job.steps?.length)throw Error(`${file}/${name}: missing runner/steps`)
    if(job.permissions?.contents==='write'&&(!job.if?.includes("refs/tags/v")||!job.needs))throw Error(`${file}/${name}: publishing must depend on verified tag packaging`)
  }
  console.log(`Validated ${file}`)
}
