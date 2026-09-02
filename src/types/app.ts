import type { Database } from './database'

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type FacilityRow = Database['public']['Tables']['facilities']['Row']
export type FieldDefinitionRow = Database['public']['Tables']['field_definitions']['Row']
export type EquipmentRow = Database['public']['Tables']['equipment']['Row']
export type EditRequestRow = Database['public']['Tables']['edit_requests']['Row']
export type AppSettingRow = Database['public']['Tables']['spare_settings']['Row']
export type EquipmentHistoryRow = Database['public']['Tables']['equipment_history']['Row']
export type CyrixItemRow = Database['public']['Tables']['cyrix_item_master']['Row']
export type BlueStarItemRow = Database['public']['Tables']['bluestar_item_master']['Row']
export type MappingHistoryRow = Database['public']['Tables']['bluestar_item_mapping_history']['Row']

// Nothing here is hardcoded any more. The warehouse was the last field
// the app itself insisted on, and 0073 released it: what an engineer is
// asked for is entirely the admin's to decide on the custom fields
// screen. `facility_id` stays so a spare filed against a warehouse before
// then keeps it through an edit rather than being quietly unfiled.
export interface EquipmentFormValues {
  facility_id: string
  custom_fields: Record<string, unknown>
  // The Cyrix item this spare is linked to. Not a column on equipment: it is
  // applied to the spare's Blue Star catalogue row when the tag is saved, so
  // the mapping lives in one place and lands in the mapping history.
  //
  // Three states, and the difference matters: a code links it, `undefined`
  // leaves whatever the catalogue already has alone, and `null` means the
  // tagger pressed Remove and wants it unlinked. Collapsing the last two
  // would let a slow item-code lookup silently unlink a mapping.
  cyrix_item_code: string | null | undefined
  cyrix_item_name: string | null
}
