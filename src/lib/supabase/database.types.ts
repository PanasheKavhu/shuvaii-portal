export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          label: string
          school_id: string
          setup_completed_at: string | null
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          label: string
          school_id: string
          setup_completed_at?: string | null
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          label?: string
          school_id?: string
          setup_completed_at?: string | null
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          created_at: string
          event: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          reason: string | null
          row_id: string
          school_id: string
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          created_at?: string
          event?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          row_id: string
          school_id: string
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          created_at?: string
          event?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          row_id?: string
          school_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_id: string
          created_at: string
          id: string
          school_id: string
          subject_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          school_id: string
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          school_id?: string
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_school_id_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_school_id_fkey"
            columns: ["subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year_id: string
          class_teacher_id: string | null
          created_at: string
          grade_level_id: string
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_teacher_id?: string | null
          created_at?: string
          grade_level_id: string
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_teacher_id?: string | null
          created_at?: string
          grade_level_id?: string
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_academic_year_id_school_id_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classes_class_teacher_id_fkey"
            columns: ["class_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_grade_level_id_school_id_fkey"
            columns: ["grade_level_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          created_at: string
          grading_scale_id: string
          id: string
          name: string
          school_id: string
          sort_order: number
          stage: Database["public"]["Enums"]["level_stage"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          grading_scale_id: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
          stage: Database["public"]["Enums"]["level_stage"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          grading_scale_id?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
          stage?: Database["public"]["Enums"]["level_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_grading_scale_id_school_id_fkey"
            columns: ["grading_scale_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grading_scales"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "grade_levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_bands: {
        Row: {
          created_at: string
          grade: string
          id: string
          max_mark: number
          min_mark: number
          remark: string | null
          scale_id: string
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade: string
          id?: string
          max_mark: number
          min_mark: number
          remark?: string | null
          scale_id: string
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade?: string
          id?: string
          max_mark?: number
          min_mark?: number
          remark?: string | null
          scale_id?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_bands_scale_id_school_id_fkey"
            columns: ["scale_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grading_scales"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "grading_bands_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_scales: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          school_id: string
          stage: Database["public"]["Enums"]["level_stage"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          school_id: string
          stage: Database["public"]["Enums"]["level_stage"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          school_id?: string
          stage?: Database["public"]["Enums"]["level_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_scales_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          accent_color: string | null
          address: string | null
          created_at: string
          email: string | null
          feature_flags: Json
          head_signature_path: string | null
          id: string
          logo_path: string | null
          motto: string | null
          name: string
          phone: string | null
          primary_color: string | null
          report_footer_text: string | null
          slug: string
          stage: Database["public"]["Enums"]["school_stage"]
          stamp_path: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          created_at?: string
          email?: string | null
          feature_flags?: Json
          head_signature_path?: string | null
          id?: string
          logo_path?: string | null
          motto?: string | null
          name: string
          phone?: string | null
          primary_color?: string | null
          report_footer_text?: string | null
          slug: string
          stage: Database["public"]["Enums"]["school_stage"]
          stamp_path?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          created_at?: string
          email?: string | null
          feature_flags?: Json
          head_signature_path?: string | null
          id?: string
          logo_path?: string | null
          motto?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          report_footer_text?: string | null
          slug?: string
          stage?: Database["public"]["Enums"]["school_stage"]
          stamp_path?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      sign_in_attempts: {
        Row: {
          created_at: string
          email_hash: string
          id: number
          succeeded: boolean
        }
        Insert: {
          created_at?: string
          email_hash: string
          id?: never
          succeeded: boolean
        }
        Update: {
          created_at?: string
          email_hash?: string
          id?: never
          succeeded?: boolean
        }
        Relationships: []
      }
      subjects: {
        Row: {
          code: string
          created_at: string
          id: string
          is_core: boolean
          name: string
          school_id: string
          sort_order: number
          stage_scope: Database["public"]["Enums"]["school_stage"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_core?: boolean
          name: string
          school_id: string
          sort_order?: number
          stage_scope: Database["public"]["Enums"]["school_stage"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_core?: boolean
          name?: string
          school_id?: string
          sort_order?: number
          stage_scope?: Database["public"]["Enums"]["school_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          kind: Database["public"]["Enums"]["term_kind"]
          marks_deadline: string | null
          name: string
          school_id: string
          starts_on: string
          status: Database["public"]["Enums"]["term_status"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          kind?: Database["public"]["Enums"]["term_kind"]
          marks_deadline?: string | null
          name: string
          school_id: string
          starts_on: string
          status?: Database["public"]["Enums"]["term_status"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["term_kind"]
          marks_deadline?: string | null
          name?: string
          school_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["term_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_school_id_fkey"
            columns: ["academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      academic_year_setup_gaps: {
        Args: { p_year_id: string }
        Returns: {
          class_id: string
          class_subject_id: string
          gap: string
        }[]
      }
      accept_my_invites: { Args: never; Returns: number }
      current_school_ids: { Args: never; Returns: string[] }
      grading_scale_is_complete: {
        Args: { p_scale_id: string }
        Returns: boolean
      }
      grading_scale_problems: {
        Args: { p_scale_id: string }
        Returns: {
          from_mark: number
          problem: string
          to_mark: number
        }[]
      }
      has_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_school_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_staff: { Args: { p_school_id: string }; Returns: boolean }
      log_invite_event: {
        Args: { p_event: string; p_membership_id: string }
        Returns: undefined
      }
      save_grading_bands: {
        Args: { p_bands: Json; p_scale_id: string }
        Returns: undefined
      }
      set_current_academic_year: {
        Args: { p_year_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "school_admin"
        | "head"
        | "hod"
        | "teacher"
        | "parent"
        | "learner"
      audit_action: "insert" | "update" | "delete" | "event"
      level_stage: "ecd" | "primary" | "o_level" | "a_level"
      membership_status: "invited" | "active" | "disabled"
      school_stage: "primary" | "secondary" | "combined"
      term_kind: "term" | "vacation" | "mock"
      term_status: "planned" | "open" | "locked" | "closed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["school_admin", "head", "hod", "teacher", "parent", "learner"],
      audit_action: ["insert", "update", "delete", "event"],
      level_stage: ["ecd", "primary", "o_level", "a_level"],
      membership_status: ["invited", "active", "disabled"],
      school_stage: ["primary", "secondary", "combined"],
      term_kind: ["term", "vacation", "mock"],
      term_status: ["planned", "open", "locked", "closed"],
    },
  },
} as const

