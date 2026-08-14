// Boot test — the guard the unit tests could not be.
//
// Every version up to 0.0.1 was uninstallable by anyone but its author.
// `.gitignore` excluded `lib/`, `main`/`exports` pointed at `lib/index.js`, and
// the only build hook was `prepack`, which pnpm refuses to run for a git
// dependency unless the installing project allowlists it. So
// `pnpm install github:LeslieWylie/dsh-task-relay` died with
// ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED and never even landed in node_modules.
// The 26 vitest tests all passed throughout, because they import `src/*.ts` —
// they never touch the entry point the package actually publishes.
//
// This file tests the shipped artifact instead:
//   1. `lib/` exists and the declared entry point resolves.
//   2. The committed build is not stale relative to `src/`.
//   3. All seven tools reach a real cordis tool registry.
//   4. A full lifecycle executes through that registry, against a real store.
//   5. The queue survives a fresh store instance — the plugin's whole premise.
//
// Needs the harness packages, so it exits 0 (skipped) from a bare clone.

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const require_ = createRequire(import.meta.url)

let passed = 0
let failed = 0
const check = (label, ok, detail) => {
  if (ok) { passed += 1; console.log(`  ok — ${label}`) }
  else { failed += 1; console.log(`  FAIL — ${label}${detail === undefined ? '' : `\n    ${detail}`}`) }
}

// ── 1. the published entry point actually exists ──
//
// This is the whole bug, in three lines. `main` and `exports` are a promise to
// whoever installs the package; a build step the installer never runs cannot
// keep it.
console.log('--- the artifact a stranger installs ---')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const entry = join(root, pkg.main)
check(`package.main (${pkg.main}) exists in the installed tree`, existsSync(entry),
  'the build output is missing — committed lib/ is how a github: install gets a runnable package, '
  + 'because pnpm blocks build scripts for git dependencies by default')
check('package.json is not private (private:true blocks publishing)', pkg.private !== true)

for (const sub of Object.values(pkg.exports ?? {})) {
  const target = typeof sub === 'string' ? sub : sub.default
  if (target === undefined) continue
  check(`exports target ${target} exists`, existsSync(join(root, target)))
}

// ── 2. the committed build matches the source it claims to be ──
//
// Committing build output buys installability and costs freshness. Rebuild into
// a scratch dir and compare. Skipped where typescript isn't installed.
let tsc
// `typescript/bin/tsc` is not an exported subpath, so resolving it directly
// fails and the freshness check would quietly skip — which is the one guard
// that makes committing build output safe. Resolve the manifest instead.
try { tsc = join(dirname(require_.resolve('typescript/package.json')), 'bin', 'tsc') } catch { /* not a dev checkout */ }
if (tsc === undefined || !existsSync(tsc)) {
  console.log('  skip — typescript not installed here, cannot check build freshness')
} else {
  const { execFileSync } = await import('node:child_process')
  const out = mkdtempSync(join(tmpdir(), 'relay-freshness-'))
  try {
    execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.json'), '--outDir', out],
      { stdio: 'pipe' })
    const { readdirSync, statSync } = await import('node:fs')
    const walk = (dir, base = '') => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p, `${base}${n}/`) : [`${base}${n}`]
    })
    const stale = walk(out).filter((rel) => {
      const committed = join(root, 'lib', rel)
      return !existsSync(committed) || readFileSync(committed, 'utf8') !== readFileSync(join(out, rel), 'utf8')
    })
    check('committed lib/ is up to date with src/', stale.length === 0,
      `stale or missing: ${stale.join(', ')} — run \`npm run build\` and commit the result`)
  } catch (error) {
    check('the project builds', false, String(error.stdout ?? error.message).slice(0, 400))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

const REQUIRED = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-system-prompt']
for (const dep of REQUIRED) {
  try { require_.resolve(dep) } catch {
    console.log(`\nSKIP the runtime half — ${dep} is not resolvable from here.`)
    console.log('Run it from inside an installed profile:')
    console.log('  cd ~/.dsh/profiles/<profile>/node_modules/dsh-task-relay && node tests/boot.test.mjs')
    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(failed > 0 ? 1 : 0)
  }
}

// ── 3. registration through a real Context ──
console.log('\n--- load this package the way a profile does ---')
const { Context } = await import('@deepseek-ai/cordis')
const ctx = new Context()
const warnings = []
ctx.on('internal/warning', (...args) => warnings.push(args.map(String).join(' ')))

for (const dep of ['@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools']) {
  const mod = await import(dep)
  await ctx.plugin(mod.default ?? mod, {})
}
await new Promise((resolve) => setTimeout(resolve, 400))
check('ctx.tools is a real service', ctx.get('tools') !== undefined)

// A scratch queue. Before `config.root` existed, the store was hardcoded to
// $HOME/.dsh/task-relay and a test like this had to write into the developer's
// own live queue — which is a good reason for a plugin to accept a root.
const store = mkdtempSync(join(tmpdir(), 'relay-boot-'))
const plugin = await import('../lib/index.js')
await ctx.plugin(plugin.default ?? plugin, { root: store })
await new Promise((resolve) => setTimeout(resolve, 600))

const TOOLS = ['task_push', 'task_list', 'task_claim', 'task_done', 'task_cancel',
               'handoff_write', 'handoff_read']
const registry = (ctx.tools.schemas() || []).map((s) => s.name)
for (const tool of TOOLS) {
  check(`${tool} is in the real tool registry`, registry.includes(tool),
    `registry holds: ${registry.join(', ') || '(nothing)'}`)
}

// ── 4. execute a real lifecycle through the real registry ──
console.log('\n--- execute through the real registry ---')
const run = async (name, args) => {
  const controller = new AbortController()
  const result = await ctx.tools.execute({ name, arguments: args, callId: `boot-${name}`, signal: controller.signal })
  if (result.isError) throw new Error(`${name}: ${result.error?.message ?? 'failed'}`)
  return result.value ?? result
}
const queueFile = join(store, 'queue.json')
const idsOnDisk = () => Object.keys(JSON.parse(readFileSync(queueFile, 'utf8')).tasks)

try {
  await run('task_push', { title: 'boot-test task', priority: 'high' })
  check('task_push writes the queue file to disk', existsSync(queueFile), queueFile)

  const [id] = idsOnDisk()
  check('the pushed task has an id', typeof id === 'string' && id.length > 0)

  const listed = await run('task_list', {})
  check('task_list returns the pushed task', String(listed).includes('boot-test task'), String(listed).slice(0, 200))

  const claimed = JSON.parse(String(await run('task_claim', { id })))
  check('task_claim moves the task to claimed', claimed.status === 'claimed', JSON.stringify(claimed).slice(0, 200))

  await run('handoff_write', { summary: 'boot handoff', nextSteps: 'none' })
  const handoffs = String(await run('handoff_read', {}))
  check('handoff_read returns what handoff_write stored', handoffs.includes('boot handoff'), handoffs.slice(0, 200))

  const done = JSON.parse(String(await run('task_done', { id, result: 'ok' })))
  check('task_done moves the task to done', done.status === 'done', JSON.stringify(done).slice(0, 200))

  // cancel semantics: an open task is deleted, a claimed one reverts to open.
  await run('task_push', { title: 'to cancel', priority: 'low' })
  const openId = idsOnDisk().find((x) => x !== id)
  await run('task_cancel', { id: openId })
  check('task_cancel deletes a task that was still open', !idsOnDisk().includes(openId),
    `still present: ${idsOnDisk().join(', ')}`)

  // ── 5. the premise: a different process sees the same queue ──
  //
  // "Cross-session" is the entire product claim. A store instance sharing this
  // one's memory would prove nothing, so build a fresh one over the same file.
  const { TaskRelayStore } = await import('../lib/store.js')
  const fresh = new TaskRelayStore(store)
  await fresh.init()
  const reread = await fresh.listTasks({})
  check('a fresh store instance reads back the persisted queue',
    reread.some((t) => t.id === id && t.status === 'done'),
    `read back: ${reread.map((t) => `${t.id}=${t.status}`).join(', ') || '(empty)'}`)
} catch (error) {
  check(`the lifecycle runs without throwing`, false, error.message)
} finally {
  rmSync(store, { recursive: true, force: true })
}

if (warnings.length > 0) console.log(`\ncontext warnings: ${warnings.length}\n  ${warnings.slice(0, 3).join('\n  ')}`)
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
