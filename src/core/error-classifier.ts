import type { ErrorKind } from './types'

export interface ErrorClassification {
  kind: ErrorKind
  confidence: 'high' | 'medium' | 'low'
}

const LENGTH_PATTERNS = [
  /maximum length for this conversation/i,
  /maximum conversation length/i,
  /会话.{0,12}(?:最大长度|长度上限|过长)/i,
  /对话.{0,12}(?:最大长度|长度上限|过长)/i
]

const MEDIUM_LENGTH_PATTERNS = [
  /conversation.{0,30}(?:too long|length limit|limit)/i,
  /maximum.{0,12}length/i
]

export function classifyVisibleError(text: string): ErrorClassification {
  const value = text.trim()
  if (!value) return { kind: 'unknown', confidence: 'low' }

  if (LENGTH_PATTERNS.some((pattern) => pattern.test(value))) {
    return { kind: 'conversation_length_limit', confidence: 'high' }
  }
  if (MEDIUM_LENGTH_PATTERNS.some((pattern) => pattern.test(value))) {
    return { kind: 'conversation_length_limit', confidence: 'medium' }
  }

  if (/rate limit|too many requests/i.test(value)) {
    return { kind: 'rate_limit', confidence: 'high' }
  }
  if (/network|connection|网络|连接失败/i.test(value)) {
    return { kind: 'network_error', confidence: 'medium' }
  }
  if (/upload|file|文件|上传/i.test(value)) {
    return { kind: 'file_error', confidence: 'medium' }
  }
  if (/usage limit|message limit|messages? remaining|额度|消息.*上限/i.test(value)) {
    return { kind: 'model_usage_limit', confidence: 'medium' }
  }
  if (/sign in|unauthorized|authentication|登录|认证/i.test(value)) {
    return { kind: 'auth_error', confidence: 'medium' }
  }

  return { kind: 'unknown', confidence: 'low' }
}
