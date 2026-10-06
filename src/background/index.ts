import { StorageMutationCoordinator, type BackgroundRequest } from './coordinator'

const coordinator = new StorageMutationCoordinator(chrome.storage.local)

chrome.runtime.onInstalled.addListener(() => {
  // State is initialized lazily after the user grants local-content consent.
})

chrome.runtime.onMessage.addListener(
  (request: BackgroundRequest, _sender, sendResponse) => {
    const fail = (error: unknown): void => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'unknown_error'
      })
    }

    if (request.type === 'guard.loadState') {
      coordinator
        .loadState()
        .then((state) => sendResponse({ ok: true, state }))
        .catch(fail)
      return true
    }

    if (request.type === 'guard.readState') {
      coordinator
        .readState()
        .then((state) => sendResponse({ ok: true, state }))
        .catch(fail)
      return true
    }

    if (request.type === 'guard.observeWindow') {
      coordinator
        .observeWindow(request.window)
        .then(({
          state,
          snapshot,
          risk,
          staleObservation,
          observationDisposition
        }) =>
          sendResponse({
            ok: true,
            state,
            snapshot,
            risk,
            staleObservation,
            observationDisposition
          })
        )
        .catch(fail)
      return true
    }

    if (request.type === 'guard.recordCompletion') {
      coordinator
        .recordCompletion(request.event)
        .then(({ state, risk }) => sendResponse({ ok: true, state, risk }))
        .catch(fail)
      return true
    }

    if (request.type === 'guard.recordFailure') {
      coordinator
        .recordFailure(request.event)
        .then(({ state, risk }) => sendResponse({ ok: true, state, risk }))
        .catch(fail)
      return true
    }

    if (request.type === 'guard.commitCalibration') {
      coordinator
        .commitCalibration(request.event)
        .then(({ state, snapshot, risk }) =>
          sendResponse({ ok: true, state, snapshot, risk })
        )
        .catch(fail)
      return true
    }

    if (request.type === 'guard.commitMeasurementScan') {
      coordinator
        .commitMeasurementScan(request.event)
        .then(({ state, snapshot, risk }) =>
          sendResponse({ ok: true, state, snapshot, risk })
        )
        .catch(fail)
      return true
    }

    if (request.type === 'guard.startGeneration') {
      coordinator
        .startGeneration(request.reason, request.observedAt)
        .then((state) => sendResponse({ ok: true, state }))
        .catch(fail)
      return true
    }

    if (request.type === 'guard.clearLearning') {
      coordinator
        .clearLearning(request.observedAt)
        .then((state) => sendResponse({ ok: true, state }))
        .catch(fail)
      return true
    }

    if (request.type === 'guard.confirmPendingFailure') {
      coordinator
        .confirmPendingFailure(
          request.conversationKey,
          request.accepted,
          request.observedAt
        )
        .then(({ state, risk }) => sendResponse({ ok: true, state, risk }))
        .catch(fail)
      return true
    }

    if (request.type === 'guard.updateControl') {
      coordinator
        .updateControl(request.conversationKey, request.patch)
        .then((state) => sendResponse({ ok: true, state }))
        .catch(fail)
      return true
    }

    if (request.type === 'guard.updatePrivacyConsent') {
      coordinator
        .updatePrivacyConsent(request.accepted, request.observedAt)
        .then((state) => sendResponse({ ok: true, state }))
        .catch(fail)
      return true
    }

    return false
  }
)
