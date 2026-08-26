// Hand-written to match supabase/migrations/0001_init.sql.
// If you'd rather keep this in perfect lockstep with the live schema, once
// the project is linked you can regenerate it with:
//   npx supabase gen types typescript --linked > src/types/database.ts
// (you may need to re-apply the `AppRole` / domain helper types below afterwards).

export type AppRole = 'engineer' | 'project_manager' | 'admin'
export type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'textarea' | 'boolean' | 'image' | 'barcode'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          ecode: string
          full_name: string
          role: AppRole
          active: boolean
          reports_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          ecode: string
          full_name: string
          role?: AppRole
          active?: boolean
          reports_to?: string | null
        }
        Update: Partial<{
          ecode: string
          full_name: string
          role: AppRole
          active: boolean
          reports_to: string | null
        }>
        Relationships: []
      }
      facilities: {
        Row: {
          id: string
          name: string
          city: string | null
          district: string | null
          active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          city?: string | null
          district?: string | null
          active?: boolean
          created_by?: string | null
        }
        Update: Partial<{
          name: string
          city: string | null
          district: string | null
          active: boolean
        }>
        Relationships: []
      }
      user_facilities: {
        Row: { user_id: string; facility_id: string }
        Insert: { user_id: string; facility_id: string }
        Update: Partial<{ user_id: string; facility_id: string }>
        Relationships: []
      }
      field_definitions: {
        Row: {
          id: string
          field_key: string
          label: string
          field_type: FieldType
          options: string[]
          image_max_count: number | null
          required: boolean
          display_order: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          field_key: string
          label: string
          field_type?: FieldType
          options?: string[]
          image_max_count?: number | null
          required?: boolean
          display_order?: number
          active?: boolean
        }
        Update: Partial<{
          field_key: string
          label: string
          field_type: FieldType
          options: string[]
          image_max_count: number | null
          required: boolean
          display_order: number
          active: boolean
        }>
        Relationships: []
      }
      equipment: {
        Row: {
          id: string
          qr_value: string
          facility_id: string
          name: string
          location: string
          images: string[]
          custom_fields: Record<string, unknown>
          bluestar_item_id: string | null
          /** The Cyrix item chosen for THIS unit, not for the part (0023). */
          cyrix_item_code: string | null
          cyrix_item_name: string | null
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          qr_value: string
          facility_id: string
          name: string
          location: string
          images?: string[]
          custom_fields?: Record<string, unknown>
          bluestar_item_id?: string | null
          cyrix_item_code?: string | null
          cyrix_item_name?: string | null
          created_by?: string | null
        }
        Update: Partial<{
          facility_id: string
          name: string
          location: string
          images: string[]
          custom_fields: Record<string, unknown>
          bluestar_item_id: string | null
          cyrix_item_code: string | null
          cyrix_item_name: string | null
          updated_by: string | null
        }>
        Relationships: []
      }
      edit_requests: {
        Row: {
          id: string
          equipment_id: string
          requested_by: string
          proposed_changes: Record<string, unknown>
          status: RequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          created_at: string
        }
        Insert: {
          equipment_id: string
          requested_by: string
          proposed_changes: Record<string, unknown>
        }
        Update: never
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          value: unknown
          updated_by: string | null
          updated_at: string
        }
        Insert: { key: string; value: unknown; updated_by?: string | null }
        Update: Partial<{ value: unknown; updated_by: string | null }>
        Relationships: []
      }
      equipment_history: {
        Row: {
          id: string
          equipment_id: string
          action: 'created' | 'updated'
          changes: Record<string, unknown>
          performed_by: string | null
          performed_at: string
          approved_by: string | null
        }
        Insert: {
          equipment_id: string
          action: 'created' | 'updated'
          changes?: Record<string, unknown>
          performed_by?: string | null
        }
        Update: never
        Relationships: []
      }
      cyrix_item_master: {
        Row: {
          id: string
          item_code: string
          item_name: string
          in_stock: number | null
          item_cost: number | null
          additional_identifier: string | null
          item_group: string | null
          parent_equipment: string | null
          make: string | null
          model: string | null
          // Generated column (migration 0012) -- read-only, never inserted.
          name_normalized: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          item_code: string
          item_name: string
          in_stock?: number | null
          item_cost?: number | null
          additional_identifier?: string | null
          item_group?: string | null
          parent_equipment?: string | null
          make?: string | null
          model?: string | null
          active?: boolean
        }
        Update: Partial<{
          item_code: string
          item_name: string
          in_stock: number | null
          item_cost: number | null
          additional_identifier: string | null
          item_group: string | null
          parent_equipment: string | null
          make: string | null
          model: string | null
          active: boolean
        }>
        Relationships: []
      }
      bluestar_item_master: {
        Row: {
          id: string
          item_code: string
          item_name: string
          barcode: string | null
          cyrix_item_code: string | null
          cyrix_item_name: string | null
          /** How many units Blue Star's master file says exist (migration 0022). */
          quantity: number | null
          // Generated column (migration 0012) -- read-only, never inserted.
          name_normalized: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          item_code: string
          item_name: string
          barcode?: string | null
          cyrix_item_code?: string | null
          cyrix_item_name?: string | null
          quantity?: number | null
          active?: boolean
        }
        Update: Partial<{
          item_code: string
          item_name: string
          barcode: string | null
          cyrix_item_code: string | null
          cyrix_item_name: string | null
          quantity: number | null
          active: boolean
        }>
        Relationships: []
      }
      bluestar_item_mapping_history: {
        Row: {
          id: string
          bluestar_item_id: string | null
          equipment_id: string | null
          barcode: string | null
          bluestar_item_code: string | null
          from_cyrix_item_code: string | null
          from_cyrix_item_name: string | null
          to_cyrix_item_code: string | null
          to_cyrix_item_name: string | null
          performed_by: string | null
          performed_at: string
        }
        // Written only by set_cyrix_mapping(); never inserted from the client.
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      resolve_edit_request: {
        Args: { request_id: string; approve: boolean; note?: string | null }
        Returns: Database['public']['Tables']['edit_requests']['Row']
      }
      // The only way to change a Blue Star -> Cyrix mapping: it writes the
      // history row and applies the change in one transaction (migration 0015).
      set_cyrix_mapping: {
        Args: { item_id: string; new_cyrix_code: string | null }
        Returns: Database['public']['Tables']['bluestar_item_master']['Row']
      }
      // How many QR codes are tagged against each catalogue item. Definer-only
      // so the count spans every warehouse rather than only the ones the
      // caller can see (migration 0022).
      bluestar_tag_counts: {
        Args: { item_ids: string[] }
        Returns: { bluestar_item_id: string; tagged_count: number }[]
      }
      // What each catalogue item's tags actually add up to -- one row per
      // distinct Cyrix item, so a part whose units disagree reports both.
      bluestar_mapping_summary: {
        Args: { item_ids: string[] }
        Returns: { bluestar_item_id: string; cyrix_item_code: string; cyrix_item_name: string | null; tag_count: number }[]
      }
      // What a spare name has been mapped to before, across every warehouse.
      cyrix_mappings_for_name: {
        Args: { p_name_normalized: string }
        Returns: {
          cyrix_item_code: string
          cyrix_item_name: string | null
          tag_count: number
          last_mapped_by: string | null
          last_mapped_at: string | null
        }[]
      }
      // Changes the Cyrix item recorded against one tagged unit, writing the
      // mapping history in the same transaction.
      set_tag_cyrix_mapping: {
        Args: { p_equipment_id: string; p_cyrix_code: string | null }
        Returns: Database['public']['Tables']['equipment']['Row']
      }
      is_admin: { Args: Record<string, never>; Returns: boolean }
    }
  }
}
