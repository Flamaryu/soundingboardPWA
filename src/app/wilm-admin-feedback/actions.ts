'use server'

import { db, isMockDb } from '@/db'
import { betaFeedback } from '@/db/schema'
import { desc } from 'drizzle-orm'
import * as fs from 'fs'
import * as path from 'path'

export async function fetchFeedbackAction(password: string) {
  const adminPassword = process.env.ADMIN_ACCESS_PASSWORD || 'wilm-secret-2026'
  
  if (password !== adminPassword) {
    throw new Error('Invalid password')
  }

  if (isMockDb()) {
    try {
      const filePath = path.join(process.cwd(), 'src', 'db', 'mock_db.json')
      if (fs.existsSync(filePath)) {
        const mockDb = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        const feedbacks = mockDb.feedbacks || []
        // Sort by created_at desc
        return feedbacks.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      }
    } catch (e) {
      console.error('Failed to read mock feedbacks:', e)
    }
    return []
  }

  // Postgres mode
  try {
    const rows = await db
      .select()
      .from(betaFeedback)
      .orderBy(desc(betaFeedback.createdAt))
    
    return rows.map((r: any) => ({
      id: r.id,
      content: r.content,
      created_at: r.createdAt.toISOString()
    }))
  } catch (err: any) {
    console.error('Failed to fetch feedback from Postgres:', err)
    return []
  }
}

export async function clearSandboxFeedAction(password: string) {
  const adminPassword = process.env.ADMIN_ACCESS_PASSWORD || 'wilm-secret-2026'
  if (password !== adminPassword) {
    throw new Error('Invalid password')
  }

  try {
    const { Redis } = await import('@upstash/redis')
    const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
    if (hasUpstashEnv) {
      const redis = Redis.fromEnv()
      await redis.del('sandbox:posts')
      return { success: true }
    } else {
      throw new Error('Upstash Redis environment variables are not configured.')
    }
  } catch (err: any) {
    console.error('Failed to clear Upstash Redis feed:', err)
    throw new Error(err.message || 'Failed to clear Upstash Redis feed')
  }
}
