export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      allowed_email_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          project_id: string | null
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          project_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          project_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      catalog_composition: {
        Row: {
          child_item_id: string
          id: string
          label: string | null
          parent_item_id: string
          quantity_factor_formula: string
          sort_order: number
        }
        Insert: {
          child_item_id: string
          id?: string
          label?: string | null
          parent_item_id: string
          quantity_factor_formula?: string
          sort_order?: number
        }
        Update: {
          child_item_id?: string
          id?: string
          label?: string | null
          parent_item_id?: string
          quantity_factor_formula?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_composition_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_composition_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_item_work: {
        Row: {
          catalog_item_id: string
          description: string | null
          hours_formula: string | null
          hours_per_unit: number
          id: string
          work_type_id: string
        }
        Insert: {
          catalog_item_id: string
          description?: string | null
          hours_formula?: string | null
          hours_per_unit?: number
          id?: string
          work_type_id: string
        }
        Update: {
          catalog_item_id?: string
          description?: string | null
          hours_formula?: string | null
          hours_per_unit?: number
          id?: string
          work_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_item_work_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_item_work_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          allowed_geometries: string[]
          category: string | null
          created_at: string
          default_images: Json | null
          default_instruction_text: string | null
          default_parameters: Json
          id: string
          is_active: boolean
          marker_style: Json | null
          measure_type: number
          name: string
          name_formula: string | null
          price_formula: string | null
          quantity_formula: string | null
          sort_order: number
          type: string
          unit: string
          unit_price: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          allowed_geometries?: string[]
          category?: string | null
          created_at?: string
          default_images?: Json | null
          default_instruction_text?: string | null
          default_parameters?: Json
          id?: string
          is_active?: boolean
          marker_style?: Json | null
          measure_type?: number
          name: string
          name_formula?: string | null
          price_formula?: string | null
          quantity_formula?: string | null
          sort_order?: number
          type: string
          unit?: string
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          allowed_geometries?: string[]
          category?: string | null
          created_at?: string
          default_images?: Json | null
          default_instruction_text?: string | null
          default_parameters?: Json
          id?: string
          is_active?: boolean
          marker_style?: Json | null
          measure_type?: number
          name?: string
          name_formula?: string | null
          price_formula?: string | null
          quantity_formula?: string | null
          sort_order?: number
          type?: string
          unit?: string
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      custom_costs: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          project_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          project_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_calc_runs: {
        Row: {
          branch_ids: string[]
          created_at: string
          id: string
          pdf_path: string | null
          project_id: string
          settings: Json
          status: string
        }
        Insert: {
          branch_ids?: string[]
          created_at?: string
          id?: string
          pdf_path?: string | null
          project_id: string
          settings?: Json
          status?: string
        }
        Update: {
          branch_ids?: string[]
          created_at?: string
          id?: string
          pdf_path?: string | null
          project_id?: string
          settings?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mass_calc_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mass_calc_settings: {
        Row: {
          created_at: string
          cut_length_m: number
          id: string
          influence_distance_m: number
          project_id: string
          spring_factor: number
          surface_thickness_m: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cut_length_m?: number
          id?: string
          influence_distance_m?: number
          project_id: string
          spring_factor?: number
          surface_thickness_m?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cut_length_m?: number
          id?: string
          influence_distance_m?: number
          project_id?: string
          spring_factor?: number
          surface_thickness_m?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mass_calc_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_points: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          latitude: number
          longitude: number
          measured_value: number
          station: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          measured_value: number
          station: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          measured_value?: number
          station?: number
        }
        Relationships: [
          {
            foreignKeyName: "measurement_points_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "road_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      project_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          project_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          project_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_items: {
        Row: {
          catalog_item_id: string
          category_id: string | null
          chainage_end: number | null
          chainage_start: number | null
          created_at: string
          geometry: Json
          id: string
          locked: boolean
          mass_calc_branch_id: string | null
          mass_calc_run_id: string | null
          notes: string | null
          offset_m: number | null
          photos: Json | null
          project_id: string
          source: string
          string_parameters: Json
          style_overrides: Json | null
          updated_at: string
          user_parameters: Json
          visible: boolean
        }
        Insert: {
          catalog_item_id: string
          category_id?: string | null
          chainage_end?: number | null
          chainage_start?: number | null
          created_at?: string
          geometry: Json
          id?: string
          locked?: boolean
          mass_calc_branch_id?: string | null
          mass_calc_run_id?: string | null
          notes?: string | null
          offset_m?: number | null
          photos?: Json | null
          project_id: string
          source?: string
          string_parameters?: Json
          style_overrides?: Json | null
          updated_at?: string
          user_parameters?: Json
          visible?: boolean
        }
        Update: {
          catalog_item_id?: string
          category_id?: string | null
          chainage_end?: number | null
          chainage_start?: number | null
          created_at?: string
          geometry?: Json
          id?: string
          locked?: boolean
          mass_calc_branch_id?: string | null
          mass_calc_run_id?: string | null
          notes?: string | null
          offset_m?: number | null
          photos?: Json | null
          project_id?: string
          source?: string
          string_parameters?: Json
          style_overrides?: Json | null
          updated_at?: string
          user_parameters?: Json
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "project_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_mass_calc_branch_id_fkey"
            columns: ["mass_calc_branch_id"]
            isOneToOne: false
            referencedRelation: "road_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_mass_calc_run_id_fkey"
            columns: ["mass_calc_run_id"]
            isOneToOne: false
            referencedRelation: "mass_calc_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_roles: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_roles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_text_sections: {
        Row: {
          content: string
          created_at: string
          id: string
          is_enabled: boolean | null
          project_id: string
          section_key: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          project_id: string
          section_key: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          project_id?: string
          section_key?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_text_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          kayttooikeusyksikkotunnus: string | null
          kohdeosoite: string | null
          kunta: string | null
          map_center: Json | null
          name: string
          osakas_count: number | null
          products: Json | null
          project_type: string | null
          road_geometry: Json | null
          staking_origin: Json | null
          tiekunta: string | null
          updated_at: string
          user_id: string | null
          vastuuhenkilo_email: string | null
          vastuuhenkilo_name: string | null
          vastuuhenkilo_phone: string | null
          vat_percentage: number | null
          yksikko_count: number | null
          zoom_level: number | null
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          kayttooikeusyksikkotunnus?: string | null
          kohdeosoite?: string | null
          kunta?: string | null
          map_center?: Json | null
          name: string
          osakas_count?: number | null
          products?: Json | null
          project_type?: string | null
          road_geometry?: Json | null
          staking_origin?: Json | null
          tiekunta?: string | null
          updated_at?: string
          user_id?: string | null
          vastuuhenkilo_email?: string | null
          vastuuhenkilo_name?: string | null
          vastuuhenkilo_phone?: string | null
          vat_percentage?: number | null
          yksikko_count?: number | null
          zoom_level?: number | null
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          kayttooikeusyksikkotunnus?: string | null
          kohdeosoite?: string | null
          kunta?: string | null
          map_center?: Json | null
          name?: string
          osakas_count?: number | null
          products?: Json | null
          project_type?: string | null
          road_geometry?: Json | null
          staking_origin?: Json | null
          tiekunta?: string | null
          updated_at?: string
          user_id?: string | null
          vastuuhenkilo_email?: string | null
          vastuuhenkilo_name?: string | null
          vastuuhenkilo_phone?: string | null
          vat_percentage?: number | null
          yksikko_count?: number | null
          zoom_level?: number | null
        }
        Relationships: []
      }
      road_branches: {
        Row: {
          created_at: string
          geometry: Json | null
          id: string
          name: string
          project_id: string
          road_width: number
          target_bearing_capacity: number
        }
        Insert: {
          created_at?: string
          geometry?: Json | null
          id?: string
          name: string
          project_id: string
          road_width?: number
          target_bearing_capacity?: number
        }
        Update: {
          created_at?: string
          geometry?: Json | null
          id?: string
          name?: string
          project_id?: string
          road_width?: number
          target_bearing_capacity?: number
        }
        Relationships: [
          {
            foreignKeyName: "road_branches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_global_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          set_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          set_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          set_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      work_types: {
        Row: {
          created_at: string
          description: string | null
          hourly_rate: number
          id: string
          name: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          name: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          hourly_rate?: number
          id?: string
          name?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_create_project: { Args: { _user_id: string }; Returns: boolean }
      can_edit_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      get_project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_global_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      is_global_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_admin: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_tievahti_domain: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "edit" | "watch"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "edit", "watch"],
    },
  },
} as const
