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
      enrolment_subjects: {
        Row: {
          class_subject_id: string
          created_at: string
          enrolment_id: string
          id: string
          school_id: string
          updated_at: string
        }
        Insert: {
          class_subject_id: string
          created_at?: string
          enrolment_id: string
          id?: string
          school_id: string
          updated_at?: string
        }
        Update: {
          class_subject_id?: string
          created_at?: string
          enrolment_id?: string
          id?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolment_subjects_class_subject_id_school_id_fkey"
            columns: ["class_subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "enrolment_subjects_enrolment_id_school_id_fkey"
            columns: ["enrolment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "enrolment_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          id: string
          learner_id: string
          school_id: string
          status: Database["public"]["Enums"]["enrolment_status"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          id?: string
          learner_id: string
          school_id: string
          status?: Database["public"]["Enums"]["enrolment_status"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          id?: string
          learner_id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["enrolment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_class_id_academic_year_id_school_id_fkey"
            columns: ["class_id", "academic_year_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "academic_year_id", "school_id"]
          },
          {
            foreignKeyName: "enrolments_learner_id_school_id_fkey"
            columns: ["learner_id", "school_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "enrolments_school_id_fkey"
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
      guardian_links: {
        Row: {
          created_at: string
          guardian_id: string
          id: string
          is_primary: boolean
          learner_id: string
          relationship: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          id?: string
          is_primary?: boolean
          learner_id: string
          relationship: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          id?: string
          is_primary?: boolean
          learner_id?: string
          relationship?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_links_guardian_id_school_id_fkey"
            columns: ["guardian_id", "school_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "guardian_links_learner_id_school_id_fkey"
            columns: ["learner_id", "school_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "guardian_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          school_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          school_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          school_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error_report: Json | null
          file_path: string | null
          id: string
          kind: Database["public"]["Enums"]["import_kind"]
          school_id: string
          status: Database["public"]["Enums"]["import_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_report?: Json | null
          file_path?: string | null
          id?: string
          kind: Database["public"]["Enums"]["import_kind"]
          school_id: string
          status?: Database["public"]["Enums"]["import_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_report?: Json | null
          file_path?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["import_kind"]
          school_id?: string
          status?: Database["public"]["Enums"]["import_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code_hash: string
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string
          guardian_id: string | null
          id: string
          learner_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code_hash: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at: string
          guardian_id?: string | null
          id?: string
          learner_id?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code_hash?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          guardian_id?: string | null
          id?: string
          learner_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_guardian_id_school_id_fkey"
            columns: ["guardian_id", "school_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "invites_learner_id_school_id_fkey"
            columns: ["learner_id", "school_id"]
            isOneToOne: false
            referencedRelation: "learners"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "invites_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      learners: {
        Row: {
          admission_date: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string
          id: string
          last_name: string
          learner_number: string
          school_id: string
          sex: Database["public"]["Enums"]["sex"] | null
          status: Database["public"]["Enums"]["learner_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admission_date?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          id?: string
          last_name: string
          learner_number: string
          school_id: string
          sex?: Database["public"]["Enums"]["sex"] | null
          status?: Database["public"]["Enums"]["learner_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admission_date?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          id?: string
          last_name?: string
          learner_number?: string
          school_id?: string
          sex?: Database["public"]["Enums"]["sex"] | null
          status?: Database["public"]["Enums"]["learner_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learners_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      commit_learner_import: {
        Args: { p_guardians: Json; p_job_id: string; p_learners: Json }
        Returns: Json
      }
      commit_staff_import: {
        Args: { p_job_id: string; p_members: Json }
        Returns: number
      }
      create_parent_invite: {
        Args: { p_code_hash: string; p_guardian_id: string }
        Returns: {
          expires_at: string
          invite_id: string
        }[]
      }
      current_school_ids: { Args: never; Returns: string[] }
      decline_my_invites: { Args: never; Returns: number }
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
      import_learners: {
        Args: { p_guardians: Json; p_learners: Json; p_school_id: string }
        Returns: Json
      }
      is_class_teacher: { Args: { p_class_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_staff: { Args: { p_school_id: string }; Returns: boolean }
      link_learner_login: {
        Args: { p_learner_id: string; p_user_id: string }
        Returns: undefined
      }
      log_invite_event: {
        Args: { p_event: string; p_membership_id: string }
        Returns: undefined
      }
      log_staff_invite_event: {
        Args: { p_event: string; p_membership_id: string }
        Returns: undefined
      }
      my_children: {
        Args: { p_school_id: string }
        Returns: {
          first_name: string
          last_name: string
          learner_id: string
          learner_number: string
        }[]
      }
      my_pending_invites: {
        Args: never
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          school_name: string
        }[]
      }
      parent_invite_preview: {
        Args: { p_code_hash: string }
        Returns: {
          children: number
          guardian_email: string
          guardian_name: string
          school_name: string
          status: string
        }[]
      }
      redeem_parent_invite: { Args: { p_code_hash: string }; Returns: string }
      save_grading_bands: {
        Args: { p_bands: Json; p_scale_id: string }
        Returns: undefined
      }
      school_staff: {
        Args: { p_school_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          membership_id: string
          phone: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }[]
      }
      set_current_academic_year: {
        Args: { p_year_id: string }
        Returns: undefined
      }
      set_learner_class: {
        Args: { p_class_id: string; p_learner_id: string }
        Returns: string
      }
      set_learner_subjects: {
        Args: { p_class_subject_ids: string[]; p_enrolment_id: string }
        Returns: undefined
      }
      sign_in_schools: {
        Args: never
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      teaches: { Args: { p_class_subject_id: string }; Returns: boolean }
      update_staff_profile: {
        Args: {
          p_full_name: string
          p_phone: string
          p_school_id: string
          p_user_id: string
        }
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
      enrolment_status:
        | "enrolled"
        | "promoted"
        | "repeating"
        | "transferred"
        | "left"
        | "graduated"
      import_kind: "staff" | "learners" | "marks"
      import_status: "validated" | "committed" | "failed"
      learner_status: "active" | "left" | "graduated"
      level_stage: "ecd" | "primary" | "o_level" | "a_level"
      membership_status: "invited" | "active" | "disabled"
      school_stage: "primary" | "secondary" | "combined"
      sex: "F" | "M"
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
      enrolment_status: [
        "enrolled",
        "promoted",
        "repeating",
        "transferred",
        "left",
        "graduated",
      ],
      import_kind: ["staff", "learners", "marks"],
      import_status: ["validated", "committed", "failed"],
      learner_status: ["active", "left", "graduated"],
      level_stage: ["ecd", "primary", "o_level", "a_level"],
      membership_status: ["invited", "active", "disabled"],
      school_stage: ["primary", "secondary", "combined"],
      sex: ["F", "M"],
      term_kind: ["term", "vacation", "mock"],
      term_status: ["planned", "open", "locked", "closed"],
    },
  },
} as const

