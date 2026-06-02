import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const migrationsFolder = resolve(__dirname, 'migrations')
  console.log(`Running migrations from ${migrationsFolder}...`)
  const sql = neon(connectionString)
  const db = drizzle(sql)
  await migrate(db, { migrationsFolder })
  console.log('Migrations complete')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
