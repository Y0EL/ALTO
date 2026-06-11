import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { db } from './client.js'
import { users } from './schema.js'

async function main() {
  const username = process.env.DEFAULT_ADMIN_USERNAME ?? 'yoel'
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? '123'
  const strictEnv = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'

  if (strictEnv && (!process.env.DEFAULT_ADMIN_USERNAME || !process.env.DEFAULT_ADMIN_PASSWORD)) {
    throw new Error('DEFAULT_ADMIN_USERNAME and DEFAULT_ADMIN_PASSWORD are required in staging/production')
  }

  if (strictEnv && (password === '123' || password.length < 8)) {
    throw new Error('Refusing to seed staging/production with a weak default admin password')
  }

  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1)
  if (existing.length > 0) {
    console.log(`Admin "${username}" already exists, skipping seed.`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  await db.insert(users).values({
    id: nanoid(),
    username,
    passwordHash,
    isAdmin: true,
  })

  console.log(`Created admin user: ${username}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
