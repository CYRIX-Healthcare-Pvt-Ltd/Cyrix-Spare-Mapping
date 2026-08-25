import { supabase } from './supabaseClient'
import type { AppRole } from '../types/database'

/**
 * Whose tagged spares a person is allowed to see: an engineer their own, a
 * manager theirs and their reports', an admin everyone's.
 *
 * `null` means no filter at all, which is not the same as an empty list --
 * an empty list would match nothing.
 *
 * Shared rather than written out per page: the dashboard count and the tagged
 * list have to agree, and they did not. The count was unscoped, so an
 * engineer who had tagged nothing was told there was one spare, and clicking
 * through showed them an empty list.
 */
export async function taggedCreatorIds(profile: { id: string; role: AppRole }): Promise<string[] | null> {
  if (profile.role === 'admin') return null

  if (profile.role === 'project_manager') {
    const { data: reports } = await supabase.from('profiles').select('id').eq('reports_to', profile.id)
    return [profile.id, ...(reports ?? []).map((r) => r.id)]
  }

  return [profile.id]
}
