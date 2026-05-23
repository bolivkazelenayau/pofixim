'use server';

import { db } from '@/db';
import { questions } from '@/db/schema';
import { notInArray, sql } from 'drizzle-orm';

export async function getRandomQuestionAction(seenIds: number[] = []) {
  try {
    // Получаем случайный вопрос
    const result =
      seenIds.length > 0
        ? await db
            .select()
            .from(questions)
            .where(notInArray(questions.id, seenIds))
            .orderBy(sql`RANDOM()`)
            .limit(1)
        : await db.select().from(questions).orderBy(sql`RANDOM()`).limit(1);
    
    if (result.length === 0) {
      return { success: true, question: null, noMoreQuestions: true };
    }
    
    return { success: true, question: result[0] };
  } catch (error) {
    console.error('Failed to fetch question:', error);
    return { success: false, error: 'Database error' };
  }
}
