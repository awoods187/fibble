import { getContentSource } from '@/lib/content';
import { handleGetPuzzle } from '@/lib/puzzle-service';

/** Returns the PublicPuzzle for a released date: statement text only, never answers. */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return handleGetPuzzle(getContentSource(), date, new Date());
}
