import { getContentSource } from '@/lib/content';
import { handleAnswer } from '@/lib/puzzle-service';

/** Grades a choice ({ choice: 0 | 1 | 2 }) and returns the AnswerResult for that round. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ date: string; n: string }> },
) {
  const { date, n } = await params;
  return handleAnswer(getContentSource(), date, n, request, new Date());
}
