import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = process.cwd()
const dist = path.join(root, 'dist')
const fixturePath = path.join(root, 'scripts', 'phase3-fixture.html')
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
]
const edge = edgeCandidates.find(function(candidate){ return fs.existsSync(candidate) })
if (!edge) throw new Error('Microsoft Edge executable not found')
if (!fs.existsSync(path.join(dist, 'manifest.json'))) throw new Error('dist/manifest.json missing')
if (!fs.existsSync(fixturePath)) throw new Error('phase3 fixture missing')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcg-phase3-e2e-'))
const profile = path.join(tmp, 'profile')
fs.mkdirSync(profile, { recursive: true })
const extensionDir = path.join(tmp, 'extension')
fs.cpSync(dist, extensionDir, { recursive:true })
const certPath = path.join(tmp, 'cert.pem')
const keyPath = path.join(tmp, 'key.pem')
const httpsPort = 19443
const debugPort = 19333
let edgeProcess
let server
let browser

function log(name, details) {
  var suffix = details === undefined ? '' : ' ' + (typeof details === 'string' ? details : JSON.stringify(details))
  process.stdout.write('[PHASE3] ' + name + suffix + '\n')
}

function assert(condition, message, details) {
  if (condition) return
  var suffix = details === undefined ? '' : ' :: ' + JSON.stringify(details)
  throw new Error(message + suffix)
}

function sleep(ms) {
  return new Promise(function(resolve){ setTimeout(resolve, ms) })
}

async function retry(fn, timeoutMs, intervalMs) {
  timeoutMs = timeoutMs || 15000
  intervalMs = intervalMs || 150
  var started = Date.now()
  var last
  while (Date.now() - started < timeoutMs) {
    try {
      var value = await fn()
      if (value) return value
    } catch (error) {
      last = error
    }
    await sleep(intervalMs)
  }
  if (last) throw last
  throw new Error('retry timed out after ' + timeoutMs + 'ms')
}

function makeCert() {
  var py = [
    'import sys, datetime',
    'from pathlib import Path',
    'from cryptography import x509',
    'from cryptography.x509.oid import NameOID',
    'from cryptography.hazmat.primitives import hashes, serialization',
    'from cryptography.hazmat.primitives.asymmetric import rsa',
    'out = Path(sys.argv[1])',
    'key = rsa.generate_private_key(public_exponent=65537, key_size=2048)',
    'subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "chatgpt.com")])',
    'cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(issuer).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=1)).not_valid_after(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=2)).add_extension(x509.SubjectAlternativeName([x509.DNSName("chatgpt.com")]), critical=False).sign(key, hashes.SHA256()))',
    '(out / "key.pem").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))',
    '(out / "cert.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))'
  ].join('\n')
  var result = spawnSync('python', ['-c', py, tmp], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error('certificate generation failed: ' + result.stderr)
}

function startServer() {
  makeCert()
  var fixture = fs.readFileSync(fixturePath)
  server = https.createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
    function(req, res) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      })
      res.end(fixture)
    }
  )
  return new Promise(function(resolve){ server.listen(httpsPort, '127.0.0.1', resolve) })
}

function launchEdge(url, loadUnpacked) {
  var args = [
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + debugPort,
    '--remote-allow-origins=*',
    '--ignore-certificate-errors',
    '--disable-quic',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=msEdgeFirstRunExperience',
    '--host-resolver-rules=MAP chatgpt.com 127.0.0.1',
    '--new-window',
    url || 'about:blank'
  ]
  if (loadUnpacked !== false) {
    args.splice(1, 0, '--load-extension=' + extensionDir, '--disable-extensions-except=' + extensionDir)
  }
  edgeProcess = spawn(edge, args, { stdio: 'ignore', windowsHide: true })
}

async function stopEdge() {
  if (!edgeProcess) return
  var pid = edgeProcess.pid
  if (pid) spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  edgeProcess = undefined
  await sleep(900)
}

async function debugPortIsReachable() {
  try {
    var response = await fetch('http://127.0.0.1:' + debugPort + '/json/version')
    return response.ok
  } catch {
    return false
  }
}

function profileEdgeProcesses() {
  var escapedProfile = profile.replace(/'/g, "''")
  var command = "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + escapedProfile + "*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
  var result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding:'utf8', windowsHide:true })
  var text = (result.stdout || '').trim()
  if (!text) return []
  try {
    var parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return [{ parseError:text }]
  }
}

function profileExtensionFacts(extensionId) {
  var output = {}
  for (var name of ['Preferences', 'Secure Preferences']) {
    var file = path.join(profile, 'Default', name)
    try {
      var json = JSON.parse(fs.readFileSync(file, 'utf8'))
      var item = json.extensions && json.extensions.settings && json.extensions.settings[extensionId]
      output[name] = item ? {
        state:item.state,
        location:item.location,
        path:item.path,
        from_webstore:item.from_webstore,
        manifest:item.manifest ? { name:item.manifest.name, version:item.manifest.version } : null
      } : null
    } catch (error) {
      output[name] = { error:String(error && error.message ? error.message : error) }
    }
  }
  return output
}

function directoryFingerprint(rootPath) {
  if (!fs.existsSync(rootPath)) return { exists:false, fileCount:0, totalBytes:0, sha256:null }
  var files = []
  function walk(current, prefix) {
    for (var entry of fs.readdirSync(current, { withFileTypes:true })) {
      var full = path.join(current, entry.name)
      var relative = prefix ? path.join(prefix, entry.name) : entry.name
      if (entry.isDirectory()) walk(full, relative)
      else if (entry.isFile()) files.push({ full:full, relative:relative.replace(/\\/g, '/') })
    }
  }
  walk(rootPath, '')
  files.sort(function(a,b){ return a.relative.localeCompare(b.relative) })
  var hash = createHash('sha256')
  var totalBytes = 0
  for (var file of files) {
    var content = fs.readFileSync(file.full)
    totalBytes += content.length
    hash.update(file.relative)
    hash.update('\u0000')
    hash.update(content)
  }
  return { exists:true, fileCount:files.length, totalBytes:totalBytes, sha256:hash.digest('hex') }
}

async function closeEdgeGracefully() {
  if (browser) {
    try {
      await browser.send('Browser.close')
    } catch {}
    browser.close()
    browser = undefined
  }

  var started = Date.now()
  while (Date.now() - started < 10000) {
    if (!(await debugPortIsReachable())) {
      var residual = profileEdgeProcesses()
      log('BROWSER_RESTART_PROFILE_PROCESSES_AFTER_CLOSE', residual)
      edgeProcess = undefined
      return { graceful:true, elapsedMs:Date.now() - started, residualProcesses:residual }
    }
    await sleep(100)
  }

  var pid = edgeProcess && edgeProcess.pid
  if (pid) {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  }
  edgeProcess = undefined
  await sleep(900)
  return { graceful:false, elapsedMs:Date.now() - started }
}

async function jsonEndpoint(pathname) {
  var response = await fetch('http://127.0.0.1:' + debugPort + pathname)
  if (!response.ok) throw new Error(pathname + ': ' + response.status)
  return response.json()
}

class Cdp {
  constructor(url) {
    this.url = url
    this.id = 0
    this.pending = new Map()
    this.waiters = new Map()
  }
  async open() {
    var self = this
    this.ws = new WebSocket(this.url)
    await new Promise(function(resolve, reject){
      var timer = setTimeout(function(){ reject(new Error('CDP websocket open timeout: ' + self.url)) }, 10000)
      self.ws.addEventListener('open', function(){ clearTimeout(timer); resolve() }, { once:true })
      self.ws.addEventListener('error', function(event){ clearTimeout(timer); reject(new Error('CDP websocket error ' + (event.message || ''))) }, { once:true })
    })
    this.ws.addEventListener('message', function(event){
      var message
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'))
      } catch {
        return
      }
      if (message.id && self.pending.has(message.id)) {
        var entry = self.pending.get(message.id)
        self.pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message + ' (' + message.error.code + ')'))
        else entry.resolve(message.result)
        return
      }
      if (message.method) {
        var list = self.waiters.get(message.method)
        if (list && list.length) {
          self.waiters.delete(message.method)
          list.forEach(function(resolve){ resolve(message.params) })
        }
      }
    })
    return this
  }
  send(method, params) {
    var self = this
    var id = ++this.id
    return new Promise(function(resolve, reject){
      self.pending.set(id, { resolve:resolve, reject:reject })
      self.ws.send(JSON.stringify({ id:id, method:method, params:params || {} }))
    })
  }
  waitEvent(method, timeoutMs) {
    var self = this
    timeoutMs = timeoutMs || 10000
    return new Promise(function(resolve, reject){
      var timer = setTimeout(function(){ reject(new Error('CDP event timeout: ' + method)) }, timeoutMs)
      var wrapped = function(value){ clearTimeout(timer); resolve(value) }
      var list = self.waiters.get(method) || []
      list.push(wrapped)
      self.waiters.set(method, list)
    })
  }
  close() {
    try { if (this.ws) this.ws.close() } catch {}
  }
}

async function browserConnect() {
  var version = await retry(function(){ return jsonEndpoint('/json/version') }, 20000)
  browser = await new Cdp(version.webSocketDebuggerUrl).open()
  return browser
}

async function connectTarget(targetId) {
  var target = await retry(async function(){
    var list = await jsonEndpoint('/json/list')
    return list.find(function(item){ return item.id === targetId })
  }, 15000)
  var cdp = await new Cdp(target.webSocketDebuggerUrl).open()
  await cdp.send('Runtime.enable')
  if (target.type === 'page') await cdp.send('Page.enable')
  return cdp
}

async function evaluate(cdp, expression) {
  var response = await cdp.send('Runtime.evaluate', {
    expression: expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  })
  if (response.exceptionDetails) {
    throw new Error((response.exceptionDetails.exception && response.exceptionDetails.exception.description) || response.exceptionDetails.text || 'evaluation failed')
  }
  return response.result && response.result.value
}

async function waitEval(cdp, expression, predicate, timeoutMs) {
  var started = Date.now()
  var last
  timeoutMs = timeoutMs || 20000
  while (Date.now() - started < timeoutMs) {
    last = await evaluate(cdp, expression)
    if (predicate(last)) return last
    await sleep(150)
  }
  throw new Error('waitEval timeout: ' + expression.slice(0, 120) + ' :: ' + JSON.stringify(last))
}

async function waitForRoot(page) {
  await waitEval(page, "!!document.querySelector('#conversation-guard-root')", Boolean, 20000)
}

async function createPage(url) {
  var result = await browser.send('Target.createTarget', { url:url })
  var page = await connectTarget(result.targetId)
  await waitForRoot(page)
  return { page:page, targetId:result.targetId }
}

async function navigate(page, url) {
  var loaded = page.waitEvent('Page.loadEventFired', 15000).catch(function(){})
  await page.send('Page.navigate', { url:url })
  await loaded
  await waitForRoot(page)
}

async function reloadPage(page) {
  var loaded = page.waitEvent('Page.loadEventFired', 15000).catch(function(){})
  await page.send('Page.reload', { ignoreCache:true })
  await loaded
  await waitForRoot(page)
}

function uiExpr() {
  return "(() => { const root=document.querySelector('#conversation-guard-root'); if(!root?.shadowRoot)return null; const s=root.shadowRoot; const q=(x)=>s.querySelector(x); return {status:q('[data-role=\"status-text\"]')?.textContent?.trim()??'',panelHidden:!!q('[data-role=\"panel\"]')?.hidden,monitorHidden:!!q('[data-role=\"monitor-panel\"]')?.hidden,consentHidden:!!q('[data-role=\"consent-panel\"]')?.hidden,trackHidden:!!q('[data-role=\"risk-track\"]')?.hidden,scaleHidden:!!q('[data-role=\"risk-scale\"]')?.hidden,activeSegments:s.querySelectorAll('[data-risk-segment][data-active=\"true\"]').length,totalSegments:s.querySelectorAll('[data-risk-segment]').length,calibrateHidden:!!q('[data-action=\"calibrate\"]')?.hidden,measureHidden:!!q('[data-action=\"measure-current\"]')?.hidden,pendingHidden:!!q('[data-role=\"pending-confirm\"]')?.hidden,text:s.textContent??''}; })()"
}

async function ui(page) {
  return evaluate(page, uiExpr())
}

async function clickShadow(page, selector) {
  return evaluate(page, "(() => { const el=document.querySelector('#conversation-guard-root')?.shadowRoot?.querySelector(" + JSON.stringify(selector) + "); if(!el)return false; el.click(); return true; })()")
}

async function nativeClickShadow(page, selector) {
  const point = await evaluate(page, "(() => { const el=document.querySelector('#conversation-guard-root')?.shadowRoot?.querySelector(" + JSON.stringify(selector) + "); if(!el)return null; const rect=el.getBoundingClientRect(); const style=getComputedStyle(el); if(rect.width<=0||rect.height<=0||style.display==='none'||style.visibility==='hidden')return null; return { x:rect.left + rect.width/2, y:rect.top + rect.height/2 }; })()")
  if (!point) return false
  await page.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:point.x, y:point.y })
  await page.send('Input.dispatchMouseEvent', { type:'mousePressed', x:point.x, y:point.y, button:'left', clickCount:1 })
  await page.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:point.x, y:point.y, button:'left', clickCount:1 })
  return true
}

async function overflowMenuFacts(page) {
  return evaluate(page, "(() => { const host=document.querySelector('#conversation-guard-root'); const menu=host?.shadowRoot?.querySelector('[data-role=\"menu-popover\"]'); if(!menu)return null; const rect=menu.getBoundingClientRect(); const style=getComputedStyle(menu); return { hidden:menu.hidden, display:style.display, left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height, viewportWidth:innerWidth, viewportHeight:innerHeight, ariaExpanded:host.shadowRoot.querySelector('[data-role=\"menu-trigger\"]')?.getAttribute('aria-expanded') }; })()")
}

async function assertOverflowMenuVisible(page, label) {
  const facts = await overflowMenuFacts(page)
  assert(facts && facts.hidden === false, label + ' menu remained hidden', facts)
  assert(facts.display !== 'none' && facts.width > 0 && facts.height > 0, label + ' menu has no visible box', facts)
  assert(facts.right > 0 && facts.left < facts.viewportWidth && facts.bottom > 0 && facts.top < facts.viewportHeight, label + ' menu is outside the viewport', facts)
  assert(facts.ariaExpanded === 'true', label + ' trigger aria-expanded did not update', facts)
  return facts
}

async function serviceWorkerTarget() {
  return retry(async function(){
    var list = await jsonEndpoint('/json/list')
    return list.find(function(item){ return item.type === 'service_worker' && item.url.indexOf('/background.js') >= 0 })
  }, 20000)
}

async function serviceWorker() {
  var target = await serviceWorkerTarget()
  return connectTarget(target.id)
}

async function getState() {
  var sw = await serviceWorker()
  try {
    return await evaluate(sw, "new Promise((resolve)=>chrome.storage.local.get('conversationGuardState',(x)=>resolve(x.conversationGuardState)))")
  } finally {
    sw.close()
  }
}

async function setStateForFixture(state) {
  var sw = await serviceWorker()
  try {
    await evaluate(
      sw,
      "new Promise((resolve,reject)=>chrome.storage.local.set({conversationGuardState:" + JSON.stringify(state) + "},()=>{const e=chrome.runtime.lastError;e?reject(new Error(e.message)):resolve(true)}))"
    )
  } finally {
    sw.close()
  }
}

function activeGeneration(state) {
  return state.generations.find(function(g){ return g.id === state.settings.generationId }) || state.generations[0]
}

function stateFacts(state) {
  var generation = activeGeneration(state)
  var usable = generation.samples.filter(function(sample){
    return sample.empiricalFailureLoad != null && (sample.failureReferenceQuality === 'strong' || sample.failureReferenceQuality === 'conservative')
  })
  var strong = usable.filter(function(sample){ return sample.failureReferenceQuality === 'strong' })
  var selected = strong.length ? strong : usable
  var R = selected.length ? Math.min.apply(null, selected.map(function(sample){ return sample.empiricalFailureLoad })) : null
  var quality = strong.length ? 'strong' : (usable.length ? 'conservative' : null)
  var growth = generation.turnGrowthSamples.filter(function(sample){ return !sample.uncertain })
  var ledgers = Object.values(state.ledgers).sort(function(a,b){ return b.updatedAt-a.updatedAt })
  var latestLedger = ledgers[0]
  return {
    generationId: state.settings.generationId,
    warmPrior: generation.warmStartPrior || null,
    sampleCount: generation.samples.length,
    pendingCount: generation.pendingFailureConfirmations.length,
    R:R,
    quality:quality,
    growthCount:generation.turnGrowthSamples.length,
    usableGrowthCount:growth.length,
    latestLedgerRevision:latestLedger ? latestLedger.ledgerRevision : null,
    latestLoad:latestLedger ? latestLedger.currentEstimatedLoad : null,
    latestCoverage:latestLedger ? latestLedger.coverageState : null,
    latestParser:latestLedger ? latestLedger.parserHealth : null,
    latestSequence:latestLedger ? latestLedger.sequenceReliability : null,
    ledgerCount:ledgers.length
  }
}

function anonymousConversationKey(state, conversationId) {
  var raw = state.installSalt + '\u001fconversation\u001fchatgpt:' + conversationId
  return 'lcg:' + createHash('sha256').update(raw, 'utf8').digest('hex')
}

function restartStateFacts(state, conversationId) {
  var generation = activeGeneration(state)
  var summary = stateFacts(state)
  var key = anonymousConversationKey(state, conversationId)
  var ledger = state.ledgers[key]
  var failureReference = summary.R
  var measurementState = !ledger
    ? 'unavailable'
    : ledger.parserHealth !== 'healthy' || ledger.sequenceReliability === 'uncertain'
      ? 'uncertain'
      : ledger.coverageState === 'complete'
        ? 'complete'
        : ledger.coverageState === 'mostly_complete' || ledger.coverageState === 'incomplete'
          ? 'partial'
          : 'uncertain'
  var environment = generation.environmentSignature
  var environmentMatches = Boolean(
    environment &&
    environment.parserSchemaVersion === 'chatgpt-dom-2026-10-v2' &&
    environment.measurementSchemaVersion === 2 &&
    environment.modelHint === 'GPT Fixture'
  )
  var calibrationState = !failureReference
    ? generation.warmStartPrior || summary.sampleCount > 0 ? 'stale' : 'uncalibrated'
    : !environmentMatches
      ? 'stale'
      : summary.quality === 'conservative'
        ? 'calibrated_conservative'
        : 'calibrated'
  var riskState = measurementState !== 'complete' ||
      (calibrationState !== 'calibrated' && calibrationState !== 'calibrated_conservative') ||
      !failureReference
    ? 'unknown'
    : ledger.currentEstimatedLoad >= failureReference
      ? 'high'
      : 'normal'
  return {
    generationId:state.settings.generationId,
    conversationKey:key,
    ledgerRevision:ledger ? ledger.ledgerRevision : null,
    observationEpoch:ledger ? ledger.observationEpoch : null,
    currentEstimatedLoad:ledger ? ledger.currentEstimatedLoad : null,
    empiricalFailureReference:failureReference,
    failureReferenceQuality:summary.quality,
    growthCount:summary.growthCount,
    measurementState:measurementState,
    calibrationState:calibrationState,
    riskState:riskState
  }
}

async function restartBrowser(url, conversationId, extensionId) {
  var shutdown = await closeEdgeGracefully()
  assert(!(await debugPortIsReachable()), 'old Edge debug endpoint remained reachable after shutdown', shutdown)
  assert((shutdown.residualProcesses || []).length === 0, 'old Edge process tree still owns the test profile after shutdown', shutdown)
  var extensionStorageDir = path.join(profile, 'Default', 'Local Extension Settings', extensionId)
  var storageBeforeRestart = directoryFingerprint(extensionStorageDir)
  log('BROWSER_RESTART_STORAGE_ON_DISK_BEFORE', storageBeforeRestart)

  var timeline = {}
  var t0 = Date.now()
  timeline.T0_edge_process_start = 0
  launchEdge('about:blank', true)
  log('BROWSER_RESTART_HARNESS_LOAD_MODE', 'same unpacked extension is supplied on every Edge process launch')
  await browserConnect()
  timeline.T0_debugger_connected = Date.now() - t0
  var initialTargets = await jsonEndpoint('/json/list')
  log('BROWSER_RESTART_TARGETS_AFTER_LAUNCH', initialTargets.map(function(item){ return { id:item.id, type:item.type, url:item.url } }))
  log('BROWSER_RESTART_PROFILE_PROCESSES_AFTER_LAUNCH', profileEdgeProcesses())
  log('BROWSER_RESTART_EXTENSION_PREFS_AFTER_LAUNCH', profileExtensionFacts(extensionId))
  try {
    var probeTarget = await browser.send('Target.createTarget', { url:'chrome-extension://' + extensionId + '/background.js' })
    var probePage = await connectTarget(probeTarget.targetId)
    var probeInfo = await waitEval(
      probePage,
      "({ href:location.href, readyState:document.readyState, origin:location.origin, hasStorage:!!(globalThis.chrome && chrome.storage && chrome.storage.local) })",
      function(value){ return value && value.readyState !== 'loading' },
      10000
    )
    log('BROWSER_RESTART_EXTENSION_PROBE', probeInfo)
    probePage.close()
    try { await browser.send('Target.closeTarget', { targetId:probeTarget.targetId }) } catch {}
  } catch (error) {
    log('BROWSER_RESTART_EXTENSION_PROBE_FAILED', String(error && error.message ? error.message : error))
  }

  var restoredPages = initialTargets.filter(function(item){ return item.type === 'page' })
  for (var restoredPage of restoredPages) {
    try {
      await browser.send('Target.closeTarget', { targetId:restoredPage.id })
    } catch {}
  }

  var createdTarget = await browser.send('Target.createTarget', { url:url })
  timeline.T2_page_target = Date.now() - t0
  log('BROWSER_RESTART_T2_PAGE_TARGET', { ms:timeline.T2_page_target, targetId:createdTarget.targetId, url:url })

  var page = await connectTarget(createdTarget.targetId)
  log('BROWSER_RESTART_PAGE_ATTACHED', await evaluate(page, "({ href:location.href, readyState:document.readyState, title:document.title, root:!!document.querySelector('#conversation-guard-root') })"))
  await waitEval(
    page,
    "document.readyState === 'interactive' || document.readyState === 'complete'",
    Boolean,
    60000
  )
  timeline.T2_page_ready = Date.now() - t0
  log('BROWSER_RESTART_T2_PAGE_READY', { ms:timeline.T2_page_ready, state:await evaluate(page, "({ href:location.href, readyState:document.readyState, title:document.title })") })

  try {
    await waitEval(
      page,
      "!!document.querySelector('#conversation-guard-root')",
      Boolean,
      10000
    )
  } catch (error) {
    var pageDiagnostic = await evaluate(page, "({ href:location.href, readyState:document.readyState, title:document.title, body:(document.body?.innerText||'').slice(0,500) })")
    var targetDiagnostic = (await jsonEndpoint('/json/list')).map(function(item){ return { type:item.type, url:item.url } })
    log('BROWSER_RESTART_ROOT_TIMEOUT', {
      page:pageDiagnostic,
      targets:targetDiagnostic
    })
    var secondShutdown = await closeEdgeGracefully()
    var storageAfterRestart = directoryFingerprint(extensionStorageDir)
    var harnessError = new Error('Edge restart harness did not reload the command-line unpacked extension')
    harnessError.code = 'restart_harness_extension_missing'
    harnessError.diagnostics = {
      timeline:timeline,
      page:pageDiagnostic,
      targets:targetDiagnostic,
      extensionPreferences:profileExtensionFacts(extensionId),
      storageBefore:storageBeforeRestart,
      storageAfter:storageAfterRestart,
      storagePreserved:
        storageBeforeRestart.exists &&
        storageAfterRestart.exists &&
        storageBeforeRestart.sha256 === storageAfterRestart.sha256,
      shutdown:shutdown,
      secondShutdown:secondShutdown
    }
    throw harnessError
  }
  timeline.T3_content_script_injected = Date.now() - t0
  log('BROWSER_RESTART_T3_CONTENT_SCRIPT', { ms:timeline.T3_content_script_injected })

  var workerTarget = await serviceWorkerTarget()
  timeline.T1_background_responds = Date.now() - t0
  log('BROWSER_RESTART_T1_BACKGROUND', { ms:timeline.T1_background_responds, url:workerTarget.url })
  var worker = await connectTarget(workerTarget.id)
  var state
  try {
    state = await evaluate(worker, "new Promise((resolve)=>chrome.storage.local.get('conversationGuardState',(x)=>resolve(x.conversationGuardState)))")
  } finally {
    worker.close()
  }
  timeline.T4_storage_loaded = Date.now() - t0
  log('BROWSER_RESTART_T4_STORAGE', { ms:timeline.T4_storage_loaded })

  var key = anonymousConversationKey(state, conversationId)
  await retry(async function(){
    var current = await getState()
    var ledger = current.ledgers[key]
    if (!ledger) return null
    timeline.T5_conversation_recognized = Date.now() - t0
    return ledger
  }, 60000, 100)

  var facts = restartStateFacts(await getState(), conversationId)
  timeline.T6_measurement_state = Date.now() - t0
  timeline.T7_calibration_state = Date.now() - t0
  timeline.T8_risk_state = Date.now() - t0

  var rendered = await waitEval(
    page,
    uiExpr(),
    function(value){
      return value &&
        /High risk|高风险|高風險/.test(value.status) &&
        value.trackHidden === false
    },
    60000
  )
  timeline.T9_ui_target_rendered = Date.now() - t0

  return {
    page:page,
    targetId:createdTarget.targetId,
    timeline:timeline,
    shutdown:shutdown,
    firstStorageState:state,
    stateFacts:facts,
    ui:rendered
  }
}

async function run() {
  await startServer()
  log('fixture-server', { httpsPort:httpsPort, profile:profile })
  launchEdge('about:blank')
  await browserConnect()
  log('edge-started', edge)
  var base = 'https://chatgpt.com:' + httpsPort

  var created = await createPage(base + '/c/first-run')
  var page = created.page
  var firstUi = await ui(page)
  assert(/Consent required|需要同意/.test(firstUi.status), 'first run did not show consent gate', firstUi)
  assert(await clickShadow(page, '[data-action="consent-accept"]'), 'consent button missing')
  firstUi = await waitEval(page, uiExpr(), function(value){ return value && /Not calibrated|未校准|未校準/.test(value.status) }, 10000)
  assert(firstUi.trackHidden && firstUi.scaleHidden, 'first run rendered full risk track', firstUi)
  assert(!/Scan current chat|扫描当前会话|掃描目前對話/.test(firstUi.text), 'old scan-current-chat UI remains', firstUi)
  assert(!/Normal|正常/.test(firstUi.status), 'first run status incorrectly Normal', firstUi)
  assert(!firstUi.calibrateHidden, 'calibration guidance/action missing on first run', firstUi)
  var cleanState = await getState()
  var cleanGen = activeGeneration(cleanState)
  assert(cleanGen.samples.length === 0, 'first run contaminated with calibration samples')
  assert(cleanGen.turnGrowthSamples.length === 0, 'first run contaminated with growth samples')
  assert(!cleanGen.warmStartPrior, 'first run contaminated with warm prior')
  log('FIRST_RUN_PASS', { ui:firstUi.status, facts:stateFacts(cleanState) })

  await navigate(page, base + '/c/limit-known')
  await waitEval(page, uiExpr(), function(value){ return value && /Not calibrated|未校准|未校準/.test(value.status) }, 10000)
  await clickShadow(page, '[data-role="pill"]')
  var beforeScanScrolls = await evaluate(page, 'window.__phase3.scrollEvents')
  assert(await clickShadow(page, '[data-action="calibrate"]'), 'explicit calibration button missing')
  await waitEval(page, uiExpr(), function(value){ return value && /Calibrating|正在校准|正在校準/.test(value.status) }, 5000)
  var calibratedState = await retry(async function(){
    var state = await getState()
    return stateFacts(state).R ? state : null
  }, 60000, 500)
  var calibratedFacts = stateFacts(calibratedState)
  assert(calibratedFacts.quality === 'strong', 'clean explicit calibration did not create strong empirical reference', calibratedFacts)
  assert(calibratedFacts.pendingCount === 0, 'explicit calibration created a second confirmation/pending path', calibratedFacts)
  var afterScanUi = await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 15000)
  assert(!afterScanUi.trackHidden && !afterScanUi.scaleHidden, 'calibrated risk track did not appear', afterScanUi)
  assert(afterScanUi.pendingHidden, 'explicit calibration displayed passive Yes/No confirmation', afterScanUi)
  var afterScanScrolls = await evaluate(page, 'window.__phase3.scrollEvents')
  assert(afterScanScrolls > beforeScanScrolls, 'full-history scan did not actually scroll the conversation')
  assert(calibratedFacts.latestLoad === calibratedFacts.R, 'calibration page load is not equal to empirical reference', calibratedFacts)
  log('EXPLICIT_CALIBRATION_PASS', { ui:afterScanUi.status, facts:calibratedFacts, scrollEvents:afterScanScrolls-beforeScanScrolls })

  var muteUi = await ui(page)
  if (muteUi.panelHidden) await clickShadow(page, '[data-role="pill"]')
  assert(await nativeClickShadow(page, '[data-role="menu-trigger"]'), 'mute menu trigger was not natively clickable')
  await assertOverflowMenuVisible(page, 'mute')
  assert(await nativeClickShadow(page, '[data-action="mute"]'), 'mute menu action was not natively clickable')
  var mutedState = await retry(async function(){
    var state = await getState()
    var key = anonymousConversationKey(state, 'limit-known')
    return state.conversationControls[key] && state.conversationControls[key].muted === true ? state : null
  }, 10000, 250)
  var mutedKey = anonymousConversationKey(mutedState, 'limit-known')
  var mutedUi = await ui(page)
  assert(/Restore alerts|恢复提醒|恢復提醒/.test(mutedUi.text), 'mute action did not update the menu label', mutedUi)

  if (mutedUi.panelHidden) await clickShadow(page, '[data-role="pill"]')
  assert(await nativeClickShadow(page, '[data-role="menu-trigger"]'), 'restore menu trigger was not natively clickable')
  await assertOverflowMenuVisible(page, 'restore')
  assert(await nativeClickShadow(page, '[data-action="mute"]'), 'restore menu action was not natively clickable')
  var restoredControlState = await retry(async function(){
    var state = await getState()
    var key = anonymousConversationKey(state, 'limit-known')
    return state.conversationControls[key] && state.conversationControls[key].muted === false ? state : null
  }, 10000, 250)
  assert(restoredControlState.conversationControls[mutedKey].muted === false, 'restore action did not persist muted=false')
  log('MUTE_CONTROL_PASS', { conversationKey:mutedKey, muted:restoredControlState.conversationControls[mutedKey].muted })

  var beforeReload = stateFacts(await getState())
  await reloadPage(page)
  var reloadUi = await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 15000)
  var afterReload = stateFacts(await getState())
  assert(afterReload.generationId === beforeReload.generationId, 'page reload changed generation')
  assert(afterReload.R === beforeReload.R && afterReload.quality === beforeReload.quality, 'page reload changed empirical reference', {beforeReload:beforeReload,afterReload:afterReload})
  assert(afterReload.growthCount === beforeReload.growthCount, 'page reload changed growth samples', {beforeReload:beforeReload,afterReload:afterReload})
  assert(afterReload.latestLedgerRevision === beforeReload.latestLedgerRevision, 'page reload changed ledger revision without new observation data', {beforeReload:beforeReload,afterReload:afterReload})
  assert(!reloadUi.trackHidden, 'page reload lost risk track')
  log('PAGE_RELOAD_PASS', { beforeReload:beforeReload, afterReload:afterReload })

  var sw = await serviceWorker()
  try { await evaluate(sw, 'chrome.runtime.reload(); true') } catch {}
  sw.close()
  await sleep(1300)
  await reloadPage(page)
  var extReloadUi = await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 15000)
  var afterExtensionReload = stateFacts(await getState())
  assert(afterExtensionReload.generationId === afterReload.generationId, 'extension reload changed generation')
  assert(afterExtensionReload.R === afterReload.R, 'extension reload changed R', {afterReload:afterReload,afterExtensionReload:afterExtensionReload})
  assert(afterExtensionReload.growthCount === afterReload.growthCount, 'extension reload changed G samples')
  assert(afterExtensionReload.latestLedgerRevision === afterReload.latestLedgerRevision, 'extension reload changed ledger revision without new observation data', {afterReload:afterReload,afterExtensionReload:afterExtensionReload})
  assert(!extReloadUi.trackHidden, 'extension reload lost calibrated risk track')
  log('EXTENSION_RELOAD_PASS', afterExtensionReload)

  var beforeHistoricalRecovery = stateFacts(await getState())
  await navigate(page, base + '/c/old-history')
  var oldHistoryUi = await waitEval(page, uiExpr(), function(value){ return value && /Unable to assess|暂时无法判断|暫時無法判斷/.test(value.status) }, 10000)
  assert(oldHistoryUi.trackHidden && oldHistoryUi.scaleHidden, 'unmeasured historical chat rendered a full risk track', oldHistoryUi)
  await clickShadow(page, '[data-role="pill"]')
  oldHistoryUi = await ui(page)
  assert(oldHistoryUi.measureHidden === false, 'historical chat measurement-recovery action missing', oldHistoryUi)
  assert(oldHistoryUi.calibrateHidden, 'ordinary historical chat incorrectly exposed failure-reference calibration', oldHistoryUi)
  var beforeHistoricalScrolls = await evaluate(page, 'window.__phase3.scrollEvents')
  assert(await nativeClickShadow(page, '[data-action="measure-current"]'), 'historical chat measurement-recovery action was not clickable')
  var recoveredHistoricalState = await retry(async function(){
    var state = await getState()
    var key = anonymousConversationKey(state, 'old-history')
    var ledger = state.ledgers[key]
    return ledger && ledger.coverageState === 'complete' && ledger.sequenceReliability === 'reliable' ? state : null
  }, 60000, 500)
  var afterHistoricalRecovery = stateFacts(recoveredHistoricalState)
  var recoveredHistoricalKey = anonymousConversationKey(recoveredHistoricalState, 'old-history')
  var recoveredHistoricalLedger = recoveredHistoricalState.ledgers[recoveredHistoricalKey]
  var recoveredHistoricalUi = await waitEval(page, uiExpr(), function(value){ return value && /Normal|正常/.test(value.status) }, 15000)
  var afterHistoricalScrolls = await evaluate(page, 'window.__phase3.scrollEvents')
  assert(afterHistoricalRecovery.R === beforeHistoricalRecovery.R, 'historical measurement recovery changed empirical failure reference', {beforeHistoricalRecovery:beforeHistoricalRecovery,afterHistoricalRecovery:afterHistoricalRecovery})
  assert(afterHistoricalRecovery.sampleCount === beforeHistoricalRecovery.sampleCount, 'historical measurement recovery changed calibration samples', {beforeHistoricalRecovery:beforeHistoricalRecovery,afterHistoricalRecovery:afterHistoricalRecovery})
  assert(afterHistoricalRecovery.growthCount === beforeHistoricalRecovery.growthCount, 'historical measurement recovery changed growth samples', {beforeHistoricalRecovery:beforeHistoricalRecovery,afterHistoricalRecovery:afterHistoricalRecovery})
  assert(recoveredHistoricalLedger.currentEstimatedLoad < afterHistoricalRecovery.R, 'old-history fixture was not below the calibrated failure reference', {load:recoveredHistoricalLedger.currentEstimatedLoad,R:afterHistoricalRecovery.R})
  assert(afterHistoricalScrolls > beforeHistoricalScrolls, 'historical measurement recovery did not perform a full-history scan')
  assert(recoveredHistoricalUi.measureHidden, 'historical measurement-recovery action remained visible after successful recovery', recoveredHistoricalUi)
  log('HISTORICAL_CHAT_MEASUREMENT_RECOVERY_PASS', { ui:recoveredHistoricalUi.status, load:recoveredHistoricalLedger.currentEstimatedLoad, R:afterHistoricalRecovery.R, scrollEvents:afterHistoricalScrolls-beforeHistoricalScrolls })

  await navigate(page, base + '/c/limit-known')
  await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 10000)

  await evaluate(page, "document.querySelector('[data-testid=\"model-switcher-dropdown-button\"]')?.remove(); true")
  var missingModelUi = await waitEval(page, uiExpr(), function(value){ return value && /Confirming environment|正在确认环境|正在確認環境/.test(value.status) }, 10000)
  assert(missingModelUi.trackHidden && missingModelUi.scaleHidden, 'missing model hint still treated the environment as calibrated', missingModelUi)
  assert(missingModelUi.calibrateHidden, 'transient environment unknown incorrectly asks the user to recalibrate', missingModelUi)
  var missingModelFacts = stateFacts(await getState())
  assert(missingModelFacts.R === calibratedFacts.R, 'missing model hint mutated the empirical failure reference', missingModelFacts)
  await evaluate(page, "(() => { const b=document.createElement('button'); b.setAttribute('data-testid','model-switcher-dropdown-button'); b.textContent='GPT Fixture'; document.querySelector('main')?.prepend(b); return true })()")
  var restoredModelUi = await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 10000)
  assert(!restoredModelUi.trackHidden, 'restored model hint did not restore current calibration use', restoredModelUi)
  log('MODEL_HINT_FAIL_CLOSED_PASS', { missing:missingModelUi.status, restored:restoredModelUi.status })

  var stateBeforeUnverifiedFixture = await getState()
  await navigate(page, base + '/c/limit-known')
  await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 10000)
  await evaluate(page, "document.querySelector('[data-testid=\"model-switcher-dropdown-button\"]')?.remove(); true")
  await waitEval(page, uiExpr(), function(value){ return value && /Confirming environment|正在确认环境|正在確認環境/.test(value.status) }, 10000)
  await clickShadow(page, '[data-role="pill"]')
  assert(await nativeClickShadow(page, '[data-role="menu-trigger"]'), 'model-unverified menu trigger was not natively clickable')
  await assertOverflowMenuVisible(page, 'model-unverified')
  assert(await nativeClickShadow(page, '[data-action="relearn"]'), 'model-unverified fixture could not natively click relearn')

  await waitEval(page, uiExpr(), function(value){ return value && /Reference may be outdated|基准可能失效|基準可能失效/.test(value.status) }, 10000)
  assert(await clickShadow(page, '[data-action="calibrate"]'), 'model-unverified fixture calibration action missing')
  var unverifiedCalibrationState = await retry(async function(){
    var state = await getState()
    var generation = activeGeneration(state)
    var failure = generation.samples.find(function(sample){ return sample.empiricalFailureLoad != null })
    return failure && failure.environmentSignature && !failure.environmentSignature.modelHint ? state : null
  }, 60000, 500)
  var unverifiedGeneration = activeGeneration(unverifiedCalibrationState)
  var unverifiedFailure = unverifiedGeneration.samples.find(function(sample){ return sample.empiricalFailureLoad != null })
  assert(unverifiedFailure && !unverifiedFailure.environmentSignature.modelHint, 'fixture calibration unexpectedly captured a model hint', unverifiedFailure)
  var unverifiedHighUi = await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 15000)
  assert(!unverifiedHighUi.trackHidden && !unverifiedHighUi.scaleHidden, 'model-unverified high warning did not restore the segmented local-reference track', unverifiedHighUi)
  assert(unverifiedHighUi.totalSegments === 16 && unverifiedHighUi.activeSegments === 16, 'model-unverified high warning did not fill all sixteen reference segments', unverifiedHighUi)

  await navigate(page, base + '/')
  var unverifiedPrompt = 'model unverified low-load fixture'
  await evaluate(page, "(() => { const el=document.querySelector('#prompt-textarea'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(el," + JSON.stringify(unverifiedPrompt) + "); el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:" + JSON.stringify(unverifiedPrompt) + "})); document.querySelector('#send').click(); return true })()")
  await waitEval(page, 'location.pathname', function(value){ return value === '/c/new-chat' }, 5000)
  var unverifiedLowUi = await waitEval(page, uiExpr(), function(value){ return value && /Model environment unconfirmed|模型环境未确认|模型環境未確認/.test(value.status) }, 15000)
  assert(!/Normal|正常/.test(unverifiedLowUi.status), 'model-unverified low load was incorrectly certified Normal', unverifiedLowUi)
  assert(!unverifiedLowUi.trackHidden && !unverifiedLowUi.scaleHidden, 'model-unverified low load did not render the segmented local-reference track', unverifiedLowUi)
  assert(unverifiedLowUi.totalSegments === 16 && unverifiedLowUi.activeSegments > 0 && unverifiedLowUi.activeSegments < 16, 'model-unverified low load did not show an intermediate reference position', unverifiedLowUi)
  assert(unverifiedLowUi.calibrateHidden, 'model-unverified low load incorrectly asks the user to recalibrate', unverifiedLowUi)
  log('MODEL_UNVERIFIED_REFERENCE_TRACK_PASS', { low:unverifiedLowUi.status, lowSegments:unverifiedLowUi.activeSegments, high:unverifiedHighUi.status, highSegments:unverifiedHighUi.activeSegments })

  await setStateForFixture(stateBeforeUnverifiedFixture)
  await navigate(page, base + '/c/limit-known')
  var restoredFixtureUi = await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 15000)
  assert(!restoredFixtureUi.trackHidden, 'fixture state restore did not recover verified calibration before remaining E2E scenarios', restoredFixtureUi)

  await navigate(page, base + '/c/sequence-live')
  await retry(async function(){
    var facts = stateFacts(await getState())
    return facts.latestSequence === 'reliable' && facts.latestLoad === calibratedFacts.R ? facts : null
  }, 10000, 250)
  await evaluate(page, "(() => { const timeline=document.querySelector('#timeline'); timeline.replaceChildren(); window.__phase3.addExternalTurn(); return true })()")
  var sequenceFacts = await retry(async function(){
    var facts = stateFacts(await getState())
    return facts.latestSequence === 'uncertain' ? facts : null
  }, 10000, 250)
  var sequenceUi = await ui(page)
  assert(sequenceFacts.latestSequence === 'uncertain', 'disjoint live DOM window did not mark sequence unreliable', sequenceFacts)
  assert(sequenceUi.trackHidden && sequenceUi.scaleHidden, 'sequence-unreliable state still rendered the full risk track', sequenceUi)
  log('SEQUENCE_FAIL_CLOSED_PASS', { ui:sequenceUi.status, sequence:sequenceFacts.latestSequence })

  log('BROWSER_RESTART_DEFERRED', 'remaining live scenarios run before the destructive browser restart check')

  await navigate(page, base + '/')
  var growthBefore = stateFacts(await getState()).growthCount
  var promptText = 'phase3 ordinary new chat prompt'
  await evaluate(page, "(() => { const el=document.querySelector('#prompt-textarea'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(el," + JSON.stringify(promptText) + "); el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:" + JSON.stringify(promptText) + "})); return el.value; })()")
  await sleep(300)
  await evaluate(page, "document.querySelector('#send').click(); true")
  await waitEval(page, 'location.pathname', function(value){ return value === '/c/new-chat' }, 5000)
  var growthState = await retry(async function(){
    var state = await getState()
    return stateFacts(state).growthCount > growthBefore ? state : null
  }, 12000, 500)
  var growthAfter = stateFacts(growthState)
  assert(growthAfter.growthCount === growthBefore + 1, 'ordinary new chat did not record exactly one whole-turn growth sample', {growthBefore:growthBefore,growthAfter:growthAfter})
  var newGen = activeGeneration(growthState)
  var lastGrowth = newGen.turnGrowthSamples[newGen.turnGrowthSamples.length-1]
  assert(lastGrowth && lastGrowth.delta === lastGrowth.afterLoad-lastGrowth.beforeLoad && lastGrowth.delta > 0, 'turn-growth sample is not a valid before/after delta', lastGrowth)
  log('NEW_CHAT_SEND_PASS', { growth:lastGrowth, facts:growthAfter })

  var marker = 'PHASE3_DRAFT_SECRET_' + Date.now() + '_'
  var draft = marker + 'x'.repeat(Math.max(50000, calibratedFacts.R * 8))
  await evaluate(page, "(() => { const el=document.querySelector('#prompt-textarea'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(el," + JSON.stringify(draft) + "); el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'x'})); return el.value.length; })()")
  var draftUi = await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 10000)
  var storageAfterDraft = JSON.stringify(await getState())
  assert(storageAfterDraft.indexOf(marker) < 0, 'raw Composer draft persisted to storage')
  assert(!draftUi.trackHidden, 'composer high-risk UI did not render calibrated track')
  log('COMPOSER_PRE_SEND_PASS', { ui:draftUi.status, draftChars:draft.length })

  await navigate(page, base + '/c/shared')
  await sleep(1700)
  var second = await createPage(base + '/c/shared')
  await sleep(1200)
  var stableSince = Date.now()
  var settlingFacts = stateFacts(await getState())
  while (Date.now() - stableSince < 3000) {
    await sleep(500)
    var nextSettlingFacts = stateFacts(await getState())
    if (nextSettlingFacts.latestLedgerRevision !== settlingFacts.latestLedgerRevision) {
      settlingFacts = nextSettlingFacts
      stableSince = Date.now()
    }
  }
  var beforeIdle = settlingFacts
  sw = await serviceWorker()
  await evaluate(sw, "globalThis.__phase3StorageChanges=0; if(!globalThis.__phase3Listener){ globalThis.__phase3Listener=()=>{globalThis.__phase3StorageChanges+=1}; chrome.storage.onChanged.addListener(globalThis.__phase3Listener) } ; true")
  await sleep(10500)
  var afterIdle = stateFacts(await getState())
  var idleChanges = await evaluate(sw, 'globalThis.__phase3StorageChanges ?? -1')
  assert(afterIdle.latestLedgerRevision === beforeIdle.latestLedgerRevision, 'ledger revision rose while two tabs were idle', {beforeIdle:beforeIdle,afterIdle:afterIdle,idleChanges:idleChanges})
  assert(idleChanges === 0, 'storage changed while two tabs were idle', {idleChanges:idleChanges,beforeIdle:beforeIdle,afterIdle:afterIdle})

  await evaluate(page, 'window.__phase3.addExternalTurn(); true')
  await sleep(1200)
  var mutationStableSince = Date.now()
  var afterOneMutation = stateFacts(await getState())
  while (Date.now() - mutationStableSince < 3500) {
    await sleep(500)
    var nextMutationFacts = stateFacts(await getState())
    if (nextMutationFacts.latestLedgerRevision !== afterOneMutation.latestLedgerRevision) {
      afterOneMutation = nextMutationFacts
      mutationStableSince = Date.now()
    }
  }
  var mutationChanges = await evaluate(sw, 'globalThis.__phase3StorageChanges ?? -1')
  assert(afterOneMutation.latestLedgerRevision > afterIdle.latestLedgerRevision, 'real tab mutation did not produce an observation write', {afterIdle:afterIdle,afterOneMutation:afterOneMutation})
  var revisionDelta = afterOneMutation.latestLedgerRevision-afterIdle.latestLedgerRevision
  assert(revisionDelta <= 2, 'one DOM mutation plus its completion produced unreasonable revision growth', {revisionDelta:revisionDelta,mutationChanges:mutationChanges})
  assert(mutationChanges <= 2, 'one DOM mutation produced too many storage writes before settling', {revisionDelta:revisionDelta,mutationChanges:mutationChanges})
  var stableRevision = afterOneMutation.latestLedgerRevision
  var changesBeforeFinalIdle = mutationChanges
  await sleep(10500)
  var afterMutationIdle = stateFacts(await getState())
  var finalChanges = await evaluate(sw, 'globalThis.__phase3StorageChanges ?? -1')
  assert(afterMutationIdle.latestLedgerRevision === stableRevision, 'other tab wrote back after storage-change UI refresh', {afterOneMutation:afterOneMutation,afterMutationIdle:afterMutationIdle,finalChanges:finalChanges})
  assert(finalChanges === changesBeforeFinalIdle, 'storage.onChanged caused additional writes after observation/completion settled', {changesBeforeFinalIdle:changesBeforeFinalIdle,finalChanges:finalChanges})
  log('MULTITAB_FEEDBACK_LOOP_PASS', { idleChanges:idleChanges, mutationChanges:mutationChanges, finalChanges:finalChanges, revisionDelta:revisionDelta, stableRevision:stableRevision })
  sw.close()
  second.page.close()
  await browser.send('Target.closeTarget', { targetId:second.targetId })
  await browser.send('Target.activateTarget', { targetId:created.targetId })

  await navigate(page, base + '/c/parser-broken')
  var parserUi = await waitEval(page, uiExpr(), function(value){ return value && /Unable to assess|暂时无法判断|暫時無法判斷/.test(value.status) }, 10000)
  assert(parserUi.trackHidden && parserUi.scaleHidden, 'parser failure still rendered full risk track', parserUi)
  log('PARSER_FAIL_CLOSED_PASS', parserUi.status)

  await navigate(page, base + '/c/limit-known')
  await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 15000)
  await clickShadow(page, '[data-role="pill"]')
  assert(await nativeClickShadow(page, '[data-role="menu-trigger"]'), 'relearn menu trigger was not natively clickable')
  await assertOverflowMenuVisible(page, 'relearn')
  assert(await nativeClickShadow(page, '[data-action="relearn"]'), 'relearn menu action was not natively clickable')

  var relearnState = await retry(async function(){
    var state = await getState()
    var facts = stateFacts(state)
    return facts.generationId !== calibratedFacts.generationId ? state : null
  }, 10000, 250)
  var relearnFacts = stateFacts(relearnState)
  assert(relearnFacts.R === null, 'relearn kept current usable R', relearnFacts)
  assert(relearnFacts.growthCount === 0, 'relearn carried current whole-turn G into new generation', relearnFacts)
  assert(relearnFacts.warmPrior && relearnFacts.warmPrior.failureReference && relearnFacts.warmPrior.failureReference.load === calibratedFacts.R, 'relearn did not keep old R only as stale prior', relearnFacts)
  var staleUi = await waitEval(page, uiExpr(), function(value){ return value && /Reference may be outdated|基准可能失效|基準可能失效/.test(value.status) }, 10000)
  assert(staleUi.trackHidden && staleUi.scaleHidden, 'stale relearn generation rendered full risk track', staleUi)
  log('RELEARN_PASS', { ui:staleUi.status, facts:relearnFacts })

  await navigate(page, base + '/c/limit-attachment')
  await waitEval(page, uiExpr(), function(value){ return value && /Reference may be outdated|基准可能失效|基準可能失效/.test(value.status) }, 10000)
  await clickShadow(page, '[data-role="pill"]')
  assert(await clickShadow(page, '[data-action="calibrate"]'), 'conservative calibration action missing')
  var conservativeState = await retry(async function(){
    var state = await getState()
    var facts = stateFacts(state)
    return facts.quality === 'conservative' ? state : null
  }, 60000, 500)
  var conservativeFacts = stateFacts(conservativeState)
  assert(conservativeFacts.pendingCount === 0, 'conservative explicit calibration created a second confirmation', conservativeFacts)
  var conservativeUi = await waitEval(page, uiExpr(), function(value){ return value && /High risk|高风险|高風險/.test(value.status) }, 15000)
  assert(!conservativeUi.trackHidden && !conservativeUi.scaleHidden, 'conservative calibration did not render calibrated risk track', conservativeUi)
  log('CONSERVATIVE_CALIBRATION_PASS', { ui:conservativeUi.status, facts:conservativeFacts })

  var restartConversationId = 'limit-attachment'
  var beforeBrowserRestartState = await getState()
  var beforeBrowserRestart = restartStateFacts(beforeBrowserRestartState, restartConversationId)
  var beforeBrowserRestartUi = await ui(page)
  var restartWorkerBeforeClose = await serviceWorkerTarget()
  var restartExtensionId = new URL(restartWorkerBeforeClose.url).host
  log('BROWSER_RESTART_EXTENSION_ID', restartExtensionId)
  log('BROWSER_RESTART_BEFORE', { state:beforeBrowserRestart, ui:beforeBrowserRestartUi.status })
  try {
    page.close()
    created = await restartBrowser(base + '/c/' + restartConversationId, restartConversationId, restartExtensionId)
    page = created.page

    var firstLoadState = restartStateFacts(created.firstStorageState, restartConversationId)
    var restartState = restartStateFacts(await getState(), restartConversationId)
    var restartUi = await ui(page)

    assert(firstLoadState.generationId === beforeBrowserRestart.generationId, 'browser restart first storage load changed generation', {beforeBrowserRestart:beforeBrowserRestart,firstLoadState:firstLoadState})
    assert(firstLoadState.empiricalFailureReference === beforeBrowserRestart.empiricalFailureReference, 'browser restart first storage load changed R', {beforeBrowserRestart:beforeBrowserRestart,firstLoadState:firstLoadState})
    assert(firstLoadState.failureReferenceQuality === beforeBrowserRestart.failureReferenceQuality, 'browser restart first storage load changed failure reference quality', {beforeBrowserRestart:beforeBrowserRestart,firstLoadState:firstLoadState})
    assert(firstLoadState.ledgerRevision === beforeBrowserRestart.ledgerRevision, 'browser restart first storage load changed ledger revision', {beforeBrowserRestart:beforeBrowserRestart,firstLoadState:firstLoadState})
    assert(firstLoadState.observationEpoch === beforeBrowserRestart.observationEpoch, 'browser restart first storage load changed observation epoch', {beforeBrowserRestart:beforeBrowserRestart,firstLoadState:firstLoadState})

    assert(restartState.generationId === beforeBrowserRestart.generationId, 'browser restart changed generation', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(restartState.empiricalFailureReference === beforeBrowserRestart.empiricalFailureReference, 'browser restart changed R', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(restartState.failureReferenceQuality === beforeBrowserRestart.failureReferenceQuality, 'browser restart changed failure reference quality', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(restartState.growthCount === beforeBrowserRestart.growthCount, 'browser restart changed growth samples', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(restartState.ledgerRevision === beforeBrowserRestart.ledgerRevision, 'browser restart changed ledger revision without new observation data', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(restartState.observationEpoch === beforeBrowserRestart.observationEpoch, 'browser restart changed observation epoch without new observation data', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(restartState.measurementState === beforeBrowserRestart.measurementState, 'browser restart changed measurement state', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(restartState.calibrationState === beforeBrowserRestart.calibrationState, 'browser restart changed calibration state', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(restartState.riskState === beforeBrowserRestart.riskState, 'browser restart changed risk state', {beforeBrowserRestart:beforeBrowserRestart,restartState:restartState})
    assert(/High risk|高风险|高風險/.test(restartUi.status), 'browser restart did not restore target risk UI', restartUi)

    var restartWorker = await serviceWorker()
    await evaluate(restartWorker, "globalThis.__phase3RestartStorageChanges=0; if(!globalThis.__phase3RestartListener){ globalThis.__phase3RestartListener=()=>{globalThis.__phase3RestartStorageChanges+=1}; chrome.storage.onChanged.addListener(globalThis.__phase3RestartListener) } ; true")
    var stableRestartRevision = restartState.ledgerRevision
    var stableRestartEpoch = restartState.observationEpoch
    await sleep(10500)
    var restartIdleState = restartStateFacts(await getState(), restartConversationId)
    var restartStorageChanges = await evaluate(restartWorker, 'globalThis.__phase3RestartStorageChanges ?? -1')
    restartWorker.close()
    assert(restartIdleState.ledgerRevision === stableRestartRevision, 'browser restart produced a storage feedback revision loop', {restartState:restartState,restartIdleState:restartIdleState,restartStorageChanges:restartStorageChanges})
    assert(restartIdleState.observationEpoch === stableRestartEpoch, 'browser restart changed observation epoch while idle', {restartState:restartState,restartIdleState:restartIdleState,restartStorageChanges:restartStorageChanges})
    assert(restartStorageChanges === 0, 'browser restart produced storage writes while idle', {restartStorageChanges:restartStorageChanges})

    log('BROWSER_RESTART_TIMELINE', created.timeline)
    log('BROWSER_RESTART_FIRST_LOAD', firstLoadState)
    log('BROWSER_RESTART_AFTER', restartState)
    log('BROWSER_RESTART_SHUTDOWN', created.shutdown)
    log('BROWSER_RESTART_PRODUCT_STATE_PASS', { before:beforeBrowserRestart, after:restartState, ui:restartUi.status, idleStorageChanges:restartStorageChanges })
    log('BROWSER_RESTART_AUTOMATION_PASS', { recoveryMs:created.timeline.T9_ui_target_rendered })
  } catch (error) {
    if (error && error.code === 'restart_harness_extension_missing') {
      var diagnostics = error.diagnostics || {}
      assert(diagnostics.storagePreserved === true, 'browser restart changed persisted extension storage while product code was not running', diagnostics)
      log('BROWSER_RESTART_TIMELINE', diagnostics.timeline || {})
      log('BROWSER_RESTART_PRODUCT_STATE_PASS', {
        before:beforeBrowserRestart,
        storageBefore:diagnostics.storageBefore,
        storageAfter:diagnostics.storageAfter,
        note:'persisted extension storage bytes survived the full Edge restart unchanged'
      })
      log('BROWSER_RESTART_AUTOMATION_PARTIAL', {
        reason:'Edge test profile did not reload the command-line unpacked extension after the process restart',
        page:diagnostics.page,
        targets:diagnostics.targets,
        extensionPreferences:diagnostics.extensionPreferences,
        shutdown:diagnostics.shutdown,
        secondShutdown:diagnostics.secondShutdown
      })
    } else {
      log('BROWSER_RESTART_PARTIAL', String(error && error.message ? error.message : error))
    }
  }

  log('REQUIRED_BROWSER_E2E_PASS')
}

try {
  await run()
} finally {
  if (browser) browser.close()
  await stopEdge()
  if (server) await new Promise(function(resolve){ server.close(resolve) })
  fs.rmSync(tmp, { recursive:true, force:true })
}
