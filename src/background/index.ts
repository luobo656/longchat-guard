import { StorageMutationCoordinator, type BackgroundRequest } from './coordinator'

const coordinator = new StorageMutationCoordinator(chrome.storage.local)

chrome.runtime.onInstalled.addListener(() => {
  // Intentionally empty for Phase 1. Persistent state modules are added next.
})

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  if (request.type === 'guard.loadState') {
    coordinator
      .loadState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.upsertLedger') {
    coordinator
      .upsertLedger(request.snapshot)
      .then(({ state, snapshot }) => sendResponse({ ok: true, state, snapshot }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.observeWindow') {
    coordinator
      .observeWindow(request.window)
      .then(({ state, snapshot, risk }) => sendResponse({ ok: true, state, snapshot, risk }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.recordCompletion') {
    coordinator
      .recordCompletion(request.event)
      .then(({ state, risk }) => sendResponse({ ok: true, state, risk }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.recordFailure') {
    coordinator
      .recordFailure(request.event)
      .then(({ state, risk }) => sendResponse({ ok: true, state, risk }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.startGeneration') {
    coordinator
      .startGeneration(request.reason, request.observedAt)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.restoreGeneration') {
    coordinator
      .restoreGeneration(request.generationId, request.observedAt)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.clearLearning') {
    coordinator
      .clearLearning(request.observedAt)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.confirmPendingFailure') {
    coordinator
      .confirmPendingFailure(request.conversationKey, request.accepted, request.observedAt)
      .then(({ state, risk }) => sendResponse({ ok: true, state, risk }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.updateControl') {
    coordinator
      .updateControl(request.conversationKey, request.patch)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.recordFeedback') {
    coordinator
      .recordFeedback(request.feedback)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  if (request.type === 'guard.updatePrivacyConsent') {
    coordinator
      .updatePrivacyConsent(request.accepted, request.observedAt)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' })
      })
    return true
  }

  return false
})
