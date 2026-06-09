import { NextResponse } from 'next/server'
import { db, isMockDb } from '@/db'
import { betaFeedback } from '@/db/schema'
import * as fs from 'fs'
import * as path from 'path'

export async function POST(request: Request) {
  try {
    const { content } = await request.json()
    if (!content || !content.trim()) {
      return NextResponse.json({ success: false, error: 'Feedback content is required' }, { status: 400 })
    }

    if (isMockDb()) {
      const filePath = path.join(process.cwd(), 'src', 'db', 'mock_db.json')
      let mockDb: any = { feedbacks: [] }
      
      if (fs.existsSync(filePath)) {
        try {
          mockDb = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        } catch (e) {
          console.warn('Could not parse mock_db.json, recreating empty container', e)
        }
      }
      
      mockDb.feedbacks = mockDb.feedbacks || []
      const newId = mockDb.feedbacks.length > 0 
        ? Math.max(...mockDb.feedbacks.map((f: any) => f.id || 0)) + 1 
        : 1
        
      const newFeedback = {
        id: newId,
        content: content.trim(),
        created_at: new Date().toISOString()
      }
      
      mockDb.feedbacks.push(newFeedback)
      fs.writeFileSync(filePath, JSON.stringify(mockDb, null, 2), 'utf-8')
      
      return NextResponse.json({ success: true, feedback: newFeedback })
    }

    // Postgres mode
    const inserted = await db
      .insert(betaFeedback)
      .values({ content: content.trim() })
      .returning()

    return NextResponse.json({ success: true, feedback: inserted[0] })
  } catch (err: any) {
    console.error('API Route Error in /api/feedback:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
