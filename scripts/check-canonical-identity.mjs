import { spawnSync } from 'node:child_process'

const formerName = ['neo', 'torrent'].join('')
const expression = [formerName, ['neo', '[-_ ]?', 'torrent'].join('')].join('|')
const result = spawnSync('git', ['grep', '-niE', expression], {
  encoding: 'utf8'
})

if (result.status === 1 && !result.stderr) process.exit(0)
if (result.status === 0) {
  process.stderr.write(
    'Former product identity found in a tracked file. Use canonical Bitwake identifiers only.\n'
  )
  process.stderr.write(result.stdout)
  process.exit(1)
}

process.stderr.write(
  result.stderr || 'Unable to check tracked files for the former product identity.\n'
)
process.exit(result.status ?? 1)
