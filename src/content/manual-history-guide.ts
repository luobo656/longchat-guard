import {t} from './i18n'
export type ManualHistoryGuideWait = (
  phase:'up'|'down'|'done',
  count:number
)=>Promise<'next'|'cancel'>

/** One lifecycle for every user-initiated full conversation read:
 * historical baseline and current-chat measurement alike.
 * The regular passive observer does not call this function.
 */
export async function withManualHistoryGuide<T>(
  operation:(wait:ManualHistoryGuideWait)=>Promise<T>,
  createGuide:typeof createManualHistoryGuide=createManualHistoryGuide
):Promise<T>{
  const guide=createGuide()
  try{
    return await operation(guide.wait)
  }finally{
    guide.close()
  }
}

/** Accessible, compact fixed guide that does not block mouse autoscrolling
 * on the ChatGPT timeline. The two confirmations are explicit human actions.
 */
export function createManualHistoryGuide():{
  wait:(phase:'up'|'down'|'done',count:number)=>Promise<'next'|'cancel'>
  close:()=>void
}{
  const root=document.createElement('div')
  root.dataset.longChatManualGuide='true'
  root.style.cssText='position:fixed;top:72px;right:18px;z-index:2147483646;width:min(340px,calc(100vw - 36px));'
  const shadow=root.attachShadow({mode:'open'})
  const wrap=document.createElement('section')
  wrap.style.cssText='font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#212121;background:#fff;border:1px solid #dedede;border-radius:14px;padding:16px;box-shadow:0 14px 42px rgba(0,0,0,.19);font-size:13px;line-height:1.6'
  wrap.setAttribute('role','dialog')
  wrap.setAttribute('aria-modal','false')
  const heading=document.createElement('strong')
  heading.style.cssText='display:block;font-size:15px;margin-bottom:8px;'
  heading.textContent=t('manualReadTitle','Read the full conversation')
  const explanation=document.createElement('p')
  explanation.style.cssText='margin:0 0 12px;white-space:pre-line;'
  const actions=document.createElement('div')
  actions.style.cssText='display:flex;gap:8px;justify-content:flex-end;'
  const cancel=document.createElement('button')
  cancel.textContent=t('manualReadCancel','Cancel')
  const next=document.createElement('button')
  next.textContent=t('manualReadReachedTop','I reached the first message')
  for(const b of [cancel,next])b.style.cssText='border:1px solid #d4d4d4;border-radius:8px;padding:7px 11px;background:#f7f7f7;color:#222;cursor:pointer;font-size:12px;'
  next.style.background='#202020';next.style.color='#fff'
  actions.append(cancel,next)
  wrap.append(heading,explanation,actions)
  shadow.append(wrap)
  document.documentElement.appendChild(root)
  let done=false
  let resolve:((result:'next'|'cancel')=>void)|undefined
  const finish=(result:'next'|'cancel')=>{
    if(done||!resolve)return
    const callback=resolve;resolve=undefined
    callback(result)
  }
  const onEscape=(event:KeyboardEvent)=>{
    if(event.key==='Escape')finish('cancel')
  }
  document.addEventListener('keydown',onEscape,true)
  cancel.addEventListener('click',()=>finish('cancel'))
  next.addEventListener('click',()=>finish('next'))
  return {
    wait:(phase,count)=>{
      if(done)return Promise.resolve('cancel')
      if(phase==='up'){
        explanation.textContent=t('manualReadScrollUp',
          'Press the middle mouse button over the chat, then move upward until the very first message appears. After reaching the top, click the button below. The extension will read after you return to the bottom. Do not refresh or switch chats.')
        next.textContent=t('manualReadReachedTop','I reached the first message')
      }else{
        explanation.textContent=t('manualReadScrollDown',
          'Now use middle-button autoscroll to move down through the entire conversation until the latest message appears. Stop scrolling, then click the button below to begin reading.')
        next.textContent=t('manualReadReachedBottom','I returned to the latest message')
      }
      return new Promise<'next'|'cancel'>(r=>{resolve=r})
    },
    close:()=>{
      if(done)return
      finish('cancel');done=true
      document.removeEventListener('keydown',onEscape,true)
      root.remove()
    }
  }
}
