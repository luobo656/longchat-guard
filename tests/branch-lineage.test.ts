import{describe,expect,it}from'vitest'
import{
  BranchPrefixStabilityWitness,
  findCertifiedInheritedPrefix,
  isBranchCreationTarget
}from'../src/content/branch-lineage'
import type{
  ObservedMessageRecord,PersistedConversationLedger,
  EnvironmentSignature
}from'../src/core/types'

const environmentSignature:EnvironmentSignature={
  parserSchemaVersion:'chatgpt-dom-2026-10-v3',
  measurementSchemaVersion:2,
  modelHint:'GPT Fixture'
}
const observed=(id:string,role:'user'|'assistant',token:number):ObservedMessageRecord=>({
  role,contentFingerprint:'hash-'+id,tokenEstimate:token,
  charCount:token*2,observedAt:10000
})
const samples=[
 observed('u1','user',21),observed('a1','assistant',33),
 observed('u2','user',14),observed('a2','assistant',24),
 observed('u3','user',11),observed('a3','assistant',28)
]
function ledger(messages= samples):PersistedConversationLedger{
 const rows=messages.map((m,i)=>({
  fingerprint:'record-'+i,contentFingerprint:m.contentFingerprint,
  role:m.role,tokenEstimate:m.tokenEstimate,observedAt:m.observedAt
 }))
 return {
  conversationKey:'parent',generationId:'generation-1',
  ledgerRevision:2,observationEpoch:10000,coverageState:'complete',
  parserHealth:'healthy',sequenceReliability:'reliable',
  activeFingerprints:rows.map(m=>m.fingerprint),
  messages:rows,currentEstimatedLoad:rows.reduce((n,m)=>n+m.tokenEstimate,0),
  uncertaintySources:[],environmentSignature,
  completedAssistantFingerprints:[],confirmedFailureFingerprints:[],
  dismissedFailureKeys:[],updatedAt:10000
 }
}
const common=(observedMessages:ObservedMessageRecord[],source=ledger())=>({
 observed:observedMessages,currentConversationKey:'child',
 ledgers:{parent:source},generationId:'generation-1',
 environmentSignature,atTail:true
})
const clickable=(title:string):Element=>({
 closest:()=>({
  getAttribute:(key:string)=>key==='aria-label'?title:'',
  textContent:title
 })
})as unknown as Element

describe('project branch inherits CERTIFIED history, never blank-chat proof',()=>{
 it('identifies Branch in new chat in both languages without arming ordinary New Chat',()=>{
  for(const phrase of ['Branch in new chat','branch-to-new-chat',
   '在新聊天中创建分支','在新對話中建立分支','建立会话分支','创建分支']){
    expect(isBranchCreationTarget(clickable(phrase)),phrase).toBe(true)
  }
  for(const phrase of ['New chat','新建聊天','Create a project','Send']){
    expect(isBranchCreationTarget(clickable(phrase)),phrase).toBe(false)
  }
 })
 it('accepts exact certified PREFIX from message zero with independent child ID',()=>{
  const actual=findCertifiedInheritedPrefix(common(samples.slice(0,4)))
  expect(actual).toBe('parent')
  expect(findCertifiedInheritedPrefix({...common(samples.slice(0,4)),
   currentConversationKey:'parent'})).toBeUndefined()
 })
 it('rejects tail fragments, content changes, out-of-order bodies and wrong role',()=>{
  expect(findCertifiedInheritedPrefix(common(samples.slice(2,6)))).toBeUndefined()
  expect(findCertifiedInheritedPrefix(common([
   samples[0]!,{...samples[1]!,contentFingerprint:'not-original'},
   ...samples.slice(2,4)
  ]))).toBeUndefined()
  expect(findCertifiedInheritedPrefix(common([
   samples[0]!,samples[2]!,samples[1]!,samples[3]!
  ]))).toBeUndefined()
  expect(findCertifiedInheritedPrefix(common([
   {...samples[0]!,role:'assistant'},...samples.slice(1,4)
  ]))).toBeUndefined()
 })
 it('refuses unknown tail, uncertified parent, stale generation and hidden attachments',()=>{
  expect(findCertifiedInheritedPrefix({...common(samples.slice(0,4)),atTail:false})).toBeUndefined()
  expect(findCertifiedInheritedPrefix(common(samples.slice(0,4),{
   ...ledger(),coverageState:'incomplete'}))).toBeUndefined()
  expect(findCertifiedInheritedPrefix(common(samples.slice(0,4),{
   ...ledger(),sequenceReliability:'uncertain'}))).toBeUndefined()
  expect(findCertifiedInheritedPrefix(common(samples.slice(0,4),{
   ...ledger(),uncertaintySources:['attachment']}))).toBeUndefined()
  expect(findCertifiedInheritedPrefix(common(samples.slice(0,4),{
   ...ledger(),generationId:'other'}))).toBeUndefined()
  expect(findCertifiedInheritedPrefix(common(samples.slice(0,4),{
   ...ledger(),environmentSignature:{...environmentSignature,measurementSchemaVersion:17}
  }))).toBeUndefined()
 })
 it('requires stable repeated evidence before inherited history becomes fully tracked',()=>{
  const proof=new BranchPrefixStabilityWitness(850)
  const input={
   newConversationId:'branch-chat',sourceKey:'parent',
   messageFingerprints:samples.slice(0,4).map(s=>s.contentFingerprint)
  }
  expect(proof.observe({...input,observedAt:1000})).toBe(false)
  expect(proof.observe({...input,observedAt:1300})).toBe(false)
  expect(proof.observe({...input,observedAt:1850})).toBe(true)
  expect(proof.observe({...input,newConversationId:'other-child',observedAt:2000})).toBe(false)
  expect(proof.observe({...input,newConversationId:'other-child',
   messageFingerprints:['new-fingerprint'],observedAt:3000})).toBe(false)
  expect(proof.observe({...input,observedAt:3100})).toBe(false)
  proof.reset()
  expect(proof.observe({...input,observedAt:4200})).toBe(false)
 })
})
