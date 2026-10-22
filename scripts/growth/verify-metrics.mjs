import {readFileSync} from 'node:fs'
const snapshots=JSON.parse(readFileSync('marketing/metrics/history.json','utf8'))
if(!Array.isArray(snapshots)||!snapshots.length)throw new Error('No verified growth baseline')
const seen=new Set()
for(const s of snapshots){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s.asOfDate)||seen.has(s.asOfDate))throw new Error('Invalid or duplicated date')
  seen.add(s.asOfDate)
  if(s.github.repo!=='luobo656/longchat-guard')throw new Error('Unexpected repository')
  for(const k of ['stars','forks','releaseDownloads']){
    if(!Number.isInteger(s.github[k])||s.github[k]<0)throw new Error('Bad public metric '+k)
  }
  for(const k of ['recentViews14d','recentClones14d']){
    const t=s.github[k]
    if(t!==null&&(!Number.isInteger(t.total)||!Number.isInteger(t.unique)||t.total<t.unique||t.windowDays!==14)){
      throw new Error('Bad optional traffic window '+k)
    }
  }
  for(const [key,value] of Object.entries(s.search)){
    if(key!=='missingReason' && value!==null)throw new Error('Unverified search metric '+key)
  }
  if(s.commerce.chromeInstalls!==null||s.commerce.edgeInstalls!==null)throw new Error('Invented install metrics')
}
const score=readFileSync('marketing/GROWTH_SCORECARD.md','utf8')
if(!score.includes('未知不等于 0')||!score.includes('不是扩展安装量'))throw new Error('Missing provenance warnings')
console.log('Validated '+snapshots.length+' real, evidence-labelled growth snapshots')
