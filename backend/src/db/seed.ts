import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { db } from './client.js'
import { users } from './schema.js'

async function main() {
  const username = process.env.DEFAULT_ADMIN_USERNAME ?? 'yoel'
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? '123'

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

  console.log(`Created admin user: ${username} / ${password}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
