import {isAuthoritativeLedgerForEnvironment} from '../core/measurement-authority'
import type {
  EnvironmentSignature,ObservedMessageRecord,PersistedConversationLedger
} from '../core/types'

/** Branches inherit prior messages, not a blank-chat birth. This deliberately
 * matches only the Branch command, never the generic "new chat" command.
 */
export function isBranchCreationTarget(target:Element|null):boolean{
  const button=target?.closest('button,[role="button"],[role="menuitem"],a[href]')
  if(!button)return false
  const semantic=[
    button.getAttribute('data-testid')??'',
    button.getAttribute('aria-label')??'',
    button.getAttribute('title')??'',
    button.textContent??''
  ].join(' ').trim()
  return /branch[\s_-]*(?:in|to)?[\s_-]*(?:a[\s_-]*)?new[\s_-]*chat|branch[\s_-]*(?:conversation|chat)|(?:建立|创建|建立新的|創建|建立新|建立一個)(?:会话|聊天|對話)?分支|(?:在新聊天中|在新對話中)(?:建立|创建|創建)分支|另開分支/i.test(semantic)
}

function activeLedgerRecords(ledger:PersistedConversationLedger){
  const byId=new Map(ledger.messages.map(m=>[m.fingerprint,m]))
  return ledger.activeFingerprints.map(key=>byId.get(key))
}

/** Only an exact, visible-from-FIRST-message, ordered prefix of a certified
 * source may serve as proof for a new branched chat. A source with uncertain
 * attachments/tool results is never silently imported.
 */
export function findCertifiedInheritedPrefix(input:{
  observed:ObservedMessageRecord[]
  currentConversationKey:string
  ledgers:Record<string,PersistedConversationLedger>
  generationId:string
  environmentSignature:EnvironmentSignature
  atTail:boolean
}):string|undefined{
  const list=input.observed
  if(!input.atTail||list.length<2||list[0]?.role!=='user'||
    !list.some(m=>m.role==='assistant')||
    list.some(m=>m.role==='unknown'||!m.contentFingerprint||
      !Number.isFinite(m.tokenEstimate)))return undefined
  for(const [sourceKey,source]of Object.entries(input.ledgers)){
    if(sourceKey===input.currentConversationKey||
      !isAuthoritativeLedgerForEnvironment({
        ledger:source,
        generationId:input.generationId,
        environmentSignature:input.environmentSignature
      })||source.uncertaintySources.length!==0)continue
    const ordered=activeLedgerRecords(source)
    if(list.length>ordered.length||ordered.some((m,i)=>
      i<list.length&&!m))continue
    if(list.every((m,i)=>m.role===ordered[i]?.role&&
      m.contentFingerprint===ordered[i]?.contentFingerprint&&
      m.tokenEstimate===ordered[i]?.tokenEstimate))
      return sourceKey
  }
  return undefined
}

/** A single transient viewport can be stale after SPA navigation.
 * Require the exact same branch-prefix witness to survive a stable dwell,
 * with a real second observation, before certifying inherited history.
 */
export class BranchPrefixStabilityWitness{
  private pending:{key:string;since:number;lastAt:number;visits:number}|undefined
  constructor(private readonly minimumStableMs=850){}
  observe(input:{
    newConversationId?:string
    sourceKey?:string
    messageFingerprints:string[]
    observedAt:number
  }):boolean{
    const{newConversationId,sourceKey,messageFingerprints,observedAt}=input
    if(!newConversationId||!sourceKey||messageFingerprints.length<2){
      this.pending=undefined;return false
    }
    const key=JSON.stringify([newConversationId,sourceKey,messageFingerprints])
    if(this.pending?.key!==key||observedAt<this.pending.lastAt){
      this.pending={key,since:observedAt,lastAt:observedAt,visits:1}
      return false
    }
    this.pending.lastAt=observedAt
    this.pending.visits+=1
    return this.pending.visits>=2&&
      observedAt-this.pending.since>=this.minimumStableMs
  }
  reset():void{this.pending=undefined}
}
