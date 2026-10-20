import {describe,expect,it,vi} from 'vitest'
import {withManualHistoryGuide} from '../src/content/manual-history-guide'

describe('manual history guide shared across full-read operations',()=>{
  it('prompts for top and bottom, then closes after a successful read',async()=>{
    const phases:string[]=[]
    const close=vi.fn()
    const create=vi.fn(()=>({
      wait:async(phase:'up'|'down'|'done',count:number)=>{
        phases.push(phase+':'+count)
        return 'next' as const
      },close
    }))
    const result=await withManualHistoryGuide(async(wait)=>{
      expect(await wait('up',0)).toBe('next')
      expect(await wait('down',0)).toBe('next')
      return {messageCount:87}
    },create)
    expect(result).toEqual({messageCount:87})
    expect(phases).toEqual(['up:0','down:0'])
    expect(create).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('cleans up on failure so calibration data cannot be accidentally committed',async()=>{
    const close=vi.fn()
    const create=()=>({wait:async()=> 'cancel' as const,close})
    await expect(withManualHistoryGuide(async(wait)=>{
      expect(await wait('up',0)).toBe('cancel')
      throw Error('manual_operation_cancelled')
    },create)).rejects.toThrow('manual_operation_cancelled')
    expect(close).toHaveBeenCalledTimes(1)
  })
})
