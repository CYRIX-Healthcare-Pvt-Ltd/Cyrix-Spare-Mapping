import type { Database } from './database'

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type FacilityRow = Database['public']['Tables']['facilities']['Row']
export type FieldDefinitionRow = Database['public']['Tables']['field_definitions']['Row']
export type EquipmentRow = Database['public']['Tables']['equipment']['Row']
export type EditRequestRow = Database['public']['Tables']['edit_requests']['Row']
export type AppSettingRow = Database['public']['Tables']['app_settings']['Row']

export interface EquipmentFormValues {
  facility_id: string
  name: string
  location: string
  images: string[]
  custom_fields: Record<string, unknown>
}
