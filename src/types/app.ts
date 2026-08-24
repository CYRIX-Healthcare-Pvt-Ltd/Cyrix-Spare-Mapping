import type { Database } from './database'

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type FacilityRow = Database['public']['Tables']['facilities']['Row']
export type FieldDefinitionRow = Database['public']['Tables']['field_definitions']['Row']
export type EquipmentRow = Database['public']['Tables']['equipment']['Row']
export type EditRequestRow = Database['public']['Tables']['edit_requests']['Row']
export type AppSettingRow = Database['public']['Tables']['app_settings']['Row']
export type EquipmentHistoryRow = Database['public']['Tables']['equipment_history']['Row']
export type CyrixItemRow = Database['public']['Tables']['cyrix_item_master']['Row']
export type BlueStarItemRow = Database['public']['Tables']['bluestar_item_master']['Row']

// Facility is the only field the app itself requires (it drives access
// control). Everything else an engineer fills in is admin-defined custom
// fields -- name/location/photos are no longer separate hardcoded inputs.
export interface EquipmentFormValues {
  facility_id: string
  custom_fields: Record<string, unknown>
}
