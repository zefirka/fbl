#!/usr/bin/env node
/**
 * Locks and unlocks the project context.
 *
 * `context.md` is the working memory of this project — the decisions, the traps, the things
 * that would take another sitting to rediscover. It is kept encrypted so it can live in the
 * repository without living in the open, and the key lives in `.env`, which git never sees.
 *
 *   node scripts/context.mjs lock     context.md      → context.md.enc
 *   node scripts/context.mjs unlock   context.md.enc  → context.md
 *
 * AES-256-GCM: one secret, held by one person, so a keypair would be ceremony. The tag means
 * a file that has been altered fails to open rather than opening wrong.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLAIN = join(ROOT, 'context.md')
const SEALED = join(ROOT, 'context.md.enc')
const ENV = join(ROOT, '.env')

const IV_BYTES = 12
const TAG_BYTES = 16

function key() {
  if (!existsSync(ENV)) fail(`no .env — the key lives there as CONTEXT_KEY, and it is not in git`)

  const line = readFileSync(ENV, 'utf8')
    .split('\n')
    .find((entry) => entry.trim().startsWith('CONTEXT_KEY='))
  const hex = line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')

  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) fail('CONTEXT_KEY in .env must be 64 hex characters')
  return Buffer.from(hex, 'hex')
}

function lock() {
  if (!existsSync(PLAIN)) fail(`nothing to lock: ${PLAIN} is not there`)

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(readFileSync(PLAIN)), cipher.final()])

  // iv ‖ tag ‖ ciphertext, wrapped at 76 characters so the file stays a text file.
  const packed = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  writeFileSync(SEALED, `${packed.replace(/(.{76})/g, '$1\n')}\n`)
  console.log(`locked ${bytes(body.length)} → context.md.enc`)
}

function unlock() {
  if (!existsSync(SEALED)) fail(`nothing to unlock: ${SEALED} is not there`)

  const packed = Buffer.from(readFileSync(SEALED, 'utf8').replace(/\s+/g, ''), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), packed.subarray(0, IV_BYTES))
  decipher.setAuthTag(packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))

  try {
    const body = Buffer.concat([decipher.update(packed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()])
    writeFileSync(PLAIN, body)
    console.log(`unlocked ${bytes(body.length)} → context.md`)
  } catch {
    fail('the key does not open this file, or the file has been altered')
  }
}

const bytes = (n) => `${(n / 1024).toFixed(1)} kB`

function fail(message) {
  console.error(message)
  process.exit(1)
}

const [, , what] = process.argv
if (what === 'lock') lock()
else if (what === 'unlock') unlock()
else fail('usage: node scripts/context.mjs lock | unlock')
