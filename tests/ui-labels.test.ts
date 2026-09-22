import { describe, expect, it } from 'vitest'
import {
  PANEL_FORBIDDEN_VALUE_PATTERNS,
  PANEL_VISIBLE_LABELS,
  PRIVACY_CONSENT_COPY
} from '../src/content/ui'

describe('guard UI labels', () => {
  it('keeps the V1 panel focused on estimate, learning, and actions', () => {
    expect(PANEL_VISIBLE_LABELS).toEqual([
      '当前会话长度',
      '本地风险趋势',
      '学习状态',
      '复制续接提示词',
      '重新学习',
      '本会话暂不提醒'
    ])

    const removedLabels = [
      '下一轮预测',
      '统计完整性',
      '校准置信度',
      '确认安全至',
      '历史风险区',
      '5 轮后提醒',
      '恢复上一档案',
      '清除全部学习数据'
    ]
    for (const label of removedLabels) {
      expect(PANEL_VISIBLE_LABELS).not.toContain(label)
    }
  })

  it('forbids user-visible precise estimate patterns', () => {
    const visibleCopy = PANEL_VISIBLE_LABELS.join('\n')
    const forbiddenSamples = ['token', 'tokens', '≈32', '32K', '32 K', '75%']

    for (const pattern of PANEL_FORBIDDEN_VALUE_PATTERNS) {
      expect(new RegExp(pattern, 'i').test(visibleCopy)).toBe(false)
    }
    for (const sample of forbiddenSamples) {
      expect(
        PANEL_FORBIDDEN_VALUE_PATTERNS.some((pattern) =>
          new RegExp(pattern, 'i').test(sample)
        )
      ).toBe(true)
    }
  })

  it('uses the approved local-trend disclaimer only', () => {
    const visibleCopy = [
      ...PANEL_VISIBLE_LABELS,
      '仅作本地趋势判断，不代表 OpenAI 官方额度或上限。'
    ].join('\n')

    expect(visibleCopy).toContain('仅作本地趋势判断，不代表 OpenAI 官方额度或上限。')
    expect(visibleCopy).not.toContain('官方剩余额度')
    expect(visibleCopy).not.toContain('≈0')
  })

  it('contains the required privacy consent copy', () => {
    expect(PRIVACY_CONSENT_COPY).toEqual([
      '仅在本机读取当前 ChatGPT 页面内容用于长会话趋势判断。',
      '不上传。',
      '不保存聊天正文。',
      '可通过卸载扩展/清除扩展数据删除本地数据。',
      '同意并开始',
      '暂不开启'
    ])
  })
})
