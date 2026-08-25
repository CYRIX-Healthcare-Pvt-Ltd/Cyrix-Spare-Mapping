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
          address: string | null
          city: string | null
          district: string | null
        // The app no longer records where anything is. address/latitude/
        // longitude are left in place (nullable, never written or read) so
        // values already stored aren't destroyed.
          latitude: number | null
          longitude: number | null
          active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          address?: string | null
          city?: string | null
          district?: string | null
          latitude?: number | null
          longitude?: number | null
          active?: boolean
          created_by?: string | null
        }
        Update: Partial<{
          name: string
          address: string | null
          city: string | null
          district: string | null
          latitude: number | null
          longitude: number | null
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
        // The app no longer captures location. These columns are left in
        // place (nullable, never written) so the historical values already
        // recorded aren't destroyed; nothing reads them.
          tag_latitude: number | null
          tag_longitude: number | null
          bluestar_item_id: string | null
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
          tag_latitude?: number | null
          tag_longitude?: number | null
          bluestar_item_id?: string | null
          created_by?: string | null
        }
        Update: Partial<{
          facility_id: string
          name: string
          location: string
          images: string[]
          custom_fields: Record<string, unknown>
          bluestar_item_id: string | null
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
          latitude: number | null
          longitude: number | null
          created_at: string
        }
        Insert: {
          equipment_id: string
          requested_by: string
          proposed_changes: Record<string, unknown>
          latitude?: number | null
          longitude?: number | null
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
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          equipment_id: string
          action: 'created' | 'updated'
          changes?: Record<string, unknown>
          performed_by?: string | null
          latitude?: number | null
          longitude?: number | null
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
          // Generated column (migration 0012) -- read-only, never inserted.
          name_normalized: string
          /** 'upload' from Blue Star's master file, 'tagged' if created by tagging a spare (0018). */
          origin: 'upload' | 'tagged'
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
          active?: boolean
        }
        Update: Partial<{
          item_code: string
          item_name: string
          barcode: string | null
          cyrix_item_code: string | null
          cyrix_item_name: string | null
          active: boolean
        }>
        Relationships: []
      }
      bluestar_item_mapping_history: {
        Row: {
          id: string
          bluestar_item_id: string
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
      // Tagging a spare records it in Blue Star's catalogue. Definer-only:
      // engineers can't insert into the catalogue directly (migration 0018).
      upsert_tagged_bluestar_item: {
        Args: { p_item_code: string; p_item_name: string; p_barcode: string | null; p_cyrix_code: string | null }
        Returns: Database['public']['Tables']['bluestar_item_master']['Row']
      }
      is_admin: { Args: Record<string, never>; Returns: boolean }
    }
  }
}
