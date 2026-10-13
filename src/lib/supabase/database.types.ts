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
      announcement_attachments: {
        Row: {
          announcement_id: string
          content_type: string
          created_at: string
          filename: string
          id: string
          path: string
          school_id: string
          size_bytes: number
          updated_at: string
        }
        Insert: {
          announcement_id: string
          content_type: string
          created_at?: string
          filename: string
          id?: string
          path: string
          school_id: string
          size_bytes: number
          updated_at?: string
        }
        Update: {
          announcement_id?: string
          content_type?: string
          created_at?: string
          filename?: string
          id?: string
          path?: string
          school_id?: string
          size_bytes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_attachments_announcement_id_school_id_fkey"
            columns: ["announcement_id", "school_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcement_attachments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          school_id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          school_id: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_school_id_fkey"
            columns: ["announcement_id", "school_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcement_reads_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["audience_type"]
          author_id: string
          body: string
          class_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          pinned: boolean
          published_at: string | null
          school_id: string
          status: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["audience_type"]
          author_id: string
          body: string
          class_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          published_at?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["audience_type"]
          author_id?: string
          body?: string
          class_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          published_at?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["announcement_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_class_id_school_id_fkey"
            columns: ["class_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_set_items: {
        Row: {
          created_at: string
          id: string
          max_mark: number
          name: string
          school_id: string
          sort_order: number
          term_kind: Database["public"]["Enums"]["term_kind"]
          type: Database["public"]["Enums"]["assessment_type"]
          updated_at: string
          weight_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_mark: number
          name: string
          school_id: string
          sort_order?: number
          term_kind: Database["public"]["Enums"]["term_kind"]
          type: Database["public"]["Enums"]["assessment_type"]
          updated_at?: string
          weight_percent: number
        }
        Update: {
          created_at?: string
          id?: string
          max_mark?: number
          name?: string
          school_id?: string
          sort_order?: number
          term_kind?: Database["public"]["Enums"]["term_kind"]
          type?: Database["public"]["Enums"]["assessment_type"]
          updated_at?: string
          weight_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_set_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessed_on: string | null
          class_subject_id: string
          created_at: string
          id: string
          is_locked: boolean
          max_mark: number
          name: string
          school_id: string
          sort_order: number
          term_id: string
          type: Database["public"]["Enums"]["assessment_type"]
          updated_at: string
          weight_percent: number
        }
        Insert: {
          assessed_on?: string | null
          class_subject_id: string
          created_at?: string
          id?: string
          is_locked?: boolean
          max_mark: number
          name: string
          school_id: string
          sort_order?: number
          term_id: string
          type: Database["public"]["Enums"]["assessment_type"]
          updated_at?: string
          weight_percent: number
        }
        Update: {
          assessed_on?: string | null
          class_subject_id?: string
          created_at?: string
          id?: string
          is_locked?: boolean
          max_mark?: number
          name?: string
          school_id?: string
          sort_order?: number
          term_id?: string
          type?: Database["public"]["Enums"]["assessment_type"]
          updated_at?: string
          weight_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessments_class_subject_id_school_id_fkey"
            columns: ["class_subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_term_id_school_id_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          class_id: string | null
          class_subject_id: string | null
          created_at: string
          event: string | null
          id: number
          learner_id: string | null
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
          class_id?: string | null
          class_subject_id?: string | null
          created_at?: string
          event?: string | null
          id?: never
          learner_id?: string | null
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
          class_id?: string | null
          class_subject_id?: string | null
          created_at?: string
          event?: string | null
          id?: never
          learner_id?: string | null
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
      class_comments: {
        Row: {
          author_id: string | null
          comment: string
          created_at: string
          enrolment_id: string
          id: string
          school_id: string
          status: Database["public"]["Enums"]["comment_status"]
          term_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          comment?: string
          created_at?: string
          enrolment_id: string
          id?: string
          school_id: string
          status?: Database["public"]["Enums"]["comment_status"]
          term_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          comment?: string
          created_at?: string
          enrolment_id?: string
          id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["comment_status"]
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_comments_enrolment_id_school_id_fkey"
            columns: ["enrolment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_comments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_comments_term_id_school_id_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      class_subject_unlocks: {
        Row: {
          class_subject_id: string
          created_at: string
          id: string
          reason: string
          relocked_at: string | null
          relocked_by: string | null
          school_id: string
          term_id: string
          unlocked_at: string
          unlocked_by: string | null
          updated_at: string
        }
        Insert: {
          class_subject_id: string
          created_at?: string
          id?: string
          reason: string
          relocked_at?: string | null
          relocked_by?: string | null
          school_id: string
          term_id: string
          unlocked_at?: string
          unlocked_by?: string | null
          updated_at?: string
        }
        Update: {
          class_subject_id?: string
          created_at?: string
          id?: string
          reason?: string
          relocked_at?: string | null
          relocked_by?: string | null
          school_id?: string
          term_id?: string
          unlocked_at?: string
          unlocked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subject_unlocks_class_subject_id_school_id_fkey"
            columns: ["class_subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_subject_unlocks_relocked_by_fkey"
            columns: ["relocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subject_unlocks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subject_unlocks_term_id_school_id_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "class_subject_unlocks_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      comment_bank: {
        Row: {
          created_at: string
          grade: string | null
          id: string
          is_shared: boolean
          owner_id: string
          school_id: string
          subject_id: string | null
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade?: string | null
          id?: string
          is_shared?: boolean
          owner_id?: string
          school_id: string
          subject_id?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade?: string | null
          id?: string
          is_shared?: boolean
          owner_id?: string
          school_id?: string
          subject_id?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_bank_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_bank_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_bank_subject_id_school_id_fkey"
            columns: ["subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "school_id"]
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
          class_subject_id: string | null
          created_at: string
          created_by: string | null
          error_report: Json | null
          file_path: string | null
          id: string
          kind: Database["public"]["Enums"]["import_kind"]
          school_id: string
          status: Database["public"]["Enums"]["import_status"]
          term_id: string | null
          updated_at: string
        }
        Insert: {
          class_subject_id?: string | null
          created_at?: string
          created_by?: string | null
          error_report?: Json | null
          file_path?: string | null
          id?: string
          kind: Database["public"]["Enums"]["import_kind"]
          school_id: string
          status?: Database["public"]["Enums"]["import_status"]
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          class_subject_id?: string | null
          created_at?: string
          created_by?: string | null
          error_report?: Json | null
          file_path?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["import_kind"]
          school_id?: string
          status?: Database["public"]["Enums"]["import_status"]
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_class_subject_fkey"
            columns: ["class_subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id", "school_id"]
          },
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
          {
            foreignKeyName: "import_jobs_term_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "school_id"]
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
      marks: {
        Row: {
          assessment_id: string
          created_at: string
          enrolment_id: string
          entered_by: string | null
          id: string
          school_id: string
          score: number | null
          status: Database["public"]["Enums"]["mark_status"]
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          enrolment_id: string
          entered_by?: string | null
          id?: string
          school_id: string
          score?: number | null
          status?: Database["public"]["Enums"]["mark_status"]
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          enrolment_id?: string
          entered_by?: string | null
          id?: string
          school_id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["mark_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marks_assessment_id_school_id_fkey"
            columns: ["assessment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "marks_enrolment_id_school_id_fkey"
            columns: ["enrolment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "marks_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_school_id_fkey"
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
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      report_share_opens: {
        Row: {
          id: string
          opened_at: string
          school_id: string
          share_id: string
        }
        Insert: {
          id?: string
          opened_at?: string
          school_id: string
          share_id: string
        }
        Update: {
          id?: string
          opened_at?: string
          school_id?: string
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_share_opens_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_share_opens_share_id_school_id_fkey"
            columns: ["share_id", "school_id"]
            isOneToOne: false
            referencedRelation: "report_shares"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      report_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          report_id: string
          revoked_at: string | null
          school_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          report_id: string
          revoked_at?: string | null
          school_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          report_id?: string
          revoked_at?: string | null
          school_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_report_id_school_id_fkey"
            columns: ["report_id", "school_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "report_shares_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          comment_label: string
          created_at: string
          footer_text: string
          id: string
          name: string
          school_id: string
          sections: Json
          term_kind: Database["public"]["Enums"]["term_kind"]
          updated_at: string
        }
        Insert: {
          comment_label?: string
          created_at?: string
          footer_text?: string
          id?: string
          name: string
          school_id: string
          sections: Json
          term_kind: Database["public"]["Enums"]["term_kind"]
          updated_at?: string
        }
        Update: {
          comment_label?: string
          created_at?: string
          footer_text?: string
          id?: string
          name?: string
          school_id?: string
          sections?: Json
          term_kind?: Database["public"]["Enums"]["term_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          average_percent: number | null
          class_position: number | null
          class_size: number | null
          created_at: string
          created_by: string | null
          enrolment_id: string
          head_comment: string | null
          id: string
          pdf_path: string | null
          published_at: string | null
          published_by: string | null
          reference_code: string | null
          return_note: string | null
          returned_at: string | null
          returned_by: string | null
          school_id: string
          snapshot: Json | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          submitted_by: string | null
          template_id: string
          term_id: string
          updated_at: string
          verification_code: string | null
          version: number
          withdrawn_at: string | null
          withdrawn_by: string | null
          withdrawn_reason: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          average_percent?: number | null
          class_position?: number | null
          class_size?: number | null
          created_at?: string
          created_by?: string | null
          enrolment_id: string
          head_comment?: string | null
          id?: string
          pdf_path?: string | null
          published_at?: string | null
          published_by?: string | null
          reference_code?: string | null
          return_note?: string | null
          returned_at?: string | null
          returned_by?: string | null
          school_id: string
          snapshot?: Json | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          template_id: string
          term_id: string
          updated_at?: string
          verification_code?: string | null
          version?: number
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          withdrawn_reason?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          average_percent?: number | null
          class_position?: number | null
          class_size?: number | null
          created_at?: string
          created_by?: string | null
          enrolment_id?: string
          head_comment?: string | null
          id?: string
          pdf_path?: string | null
          published_at?: string | null
          published_by?: string | null
          reference_code?: string | null
          return_note?: string | null
          returned_at?: string | null
          returned_by?: string | null
          school_id?: string
          snapshot?: Json | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          template_id?: string
          term_id?: string
          updated_at?: string
          verification_code?: string | null
          version?: number
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          withdrawn_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_enrolment_id_school_id_fkey"
            columns: ["enrolment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "reports_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_template_id_school_id_fkey"
            columns: ["template_id", "school_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "reports_term_id_school_id_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "reports_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          privacy_contact_email: string | null
          privacy_contact_name: string | null
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
          privacy_contact_email?: string | null
          privacy_contact_name?: string | null
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
          privacy_contact_email?: string | null
          privacy_contact_name?: string | null
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
      subject_comments: {
        Row: {
          class_subject_id: string
          comment: string
          created_at: string
          enrolment_id: string
          id: string
          school_id: string
          signed_at: string | null
          status: Database["public"]["Enums"]["comment_status"]
          teacher_id: string | null
          term_id: string
          updated_at: string
        }
        Insert: {
          class_subject_id: string
          comment?: string
          created_at?: string
          enrolment_id: string
          id?: string
          school_id: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["comment_status"]
          teacher_id?: string | null
          term_id: string
          updated_at?: string
        }
        Update: {
          class_subject_id?: string
          comment?: string
          created_at?: string
          enrolment_id?: string
          id?: string
          school_id?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["comment_status"]
          teacher_id?: string | null
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_comments_class_subject_id_school_id_fkey"
            columns: ["class_subject_id", "school_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "subject_comments_enrolment_id_school_id_fkey"
            columns: ["enrolment_id", "school_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "subject_comments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_comments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_comments_term_id_school_id_fkey"
            columns: ["term_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "school_id"]
          },
        ]
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
      two_factor_resets: {
        Row: {
          created_at: string
          id: number
          reset_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          reset_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          reset_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      academic_year_scale_gaps: {
        Args: { p_year_id: string }
        Returns: {
          grade_level_id: string
          grade_level_name: string
          scale_id: string
          scale_name: string
        }[]
      }
      academic_year_setup_gaps: {
        Args: { p_year_id: string }
        Returns: {
          class_id: string
          class_subject_id: string
          gap: string
        }[]
      }
      accept_my_invites: { Args: never; Returns: number }
      announcement_read_counts: {
        Args: { p_school_id: string }
        Returns: {
          announcement_id: string
          audience_count: number
          read_count: number
        }[]
      }
      approve_class_reports: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: number
      }
      approve_report: { Args: { p_report_id: string }; Returns: undefined }
      archive_announcement: {
        Args: { p_announcement_id: string }
        Returns: undefined
      }
      assessment_weight_problems: {
        Args: { p_term_id: string }
        Returns: {
          class_subject_id: string
          total_weight: number
        }[]
      }
      assessment_weights_are_complete: {
        Args: { p_class_subject_id: string; p_term_id: string }
        Returns: boolean
      }
      audit_entries: {
        Args: {
          p_actor_id?: string
          p_before_at?: string
          p_before_id?: number
          p_class_id?: string
          p_from?: string
          p_learner_id?: string
          p_limit?: number
          p_school_id: string
          p_to?: string
        }
        Returns: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_name: string
          assessment_name: string
          class_name: string
          created_at: string
          event: string
          id: number
          learner_name: string
          learner_number: string
          new_data: Json
          old_data: Json
          other_class_name: string
          person_name: string
          reason: string
          subject_name: string
          table_name: string
          term_name: string
        }[]
      }
      browse_search: {
        Args: { p_query: string; p_school_id: string }
        Returns: {
          detail: string
          id: string
          kind: string
          label: string
          roles: Database["public"]["Enums"]["app_role"][]
        }[]
      }
      class_comment_lock: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: {
          lock_reason: string
          marks_deadline: string
          teachers_locked: boolean
        }[]
      }
      class_positions: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: {
          average: number
          class_id: string
          class_size: number
          enrolment_id: string
          position: number
          school_id: string
          subjects_counted: number
          term_id: string
        }[]
      }
      commit_learner_import: {
        Args: { p_guardians: Json; p_job_id: string; p_learners: Json }
        Returns: Json
      }
      commit_marks_import: {
        Args: { p_job_id: string; p_marks: Json }
        Returns: number
      }
      commit_staff_import: {
        Args: { p_job_id: string; p_members: Json }
        Returns: number
      }
      completion_class_subjects: {
        Args: { p_term_id: string }
        Returns: {
          assessments: number
          class_id: string
          class_name: string
          class_subject_id: string
          comments_missing: number
          learners: number
          marks_missing: number
          subject_name: string
          teacher_id: string
          teacher_name: string
          total_weight: number
        }[]
      }
      completion_classes: {
        Args: { p_term_id: string }
        Returns: {
          class_comments_missing: number
          class_id: string
          class_name: string
          class_teacher_id: string
          class_teacher_name: string
          learners: number
        }[]
      }
      create_parent_invite: {
        Args: { p_code_hash: string; p_guardian_id: string }
        Returns: {
          expires_at: string
          invite_id: string
        }[]
      }
      create_report_share: {
        Args: { p_report_id: string }
        Returns: {
          expires_at: string
          share_id: string
          token: string
        }[]
      }
      current_school_ids: { Args: never; Returns: string[] }
      decline_my_invites: { Args: never; Returns: number }
      export_class_comments: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: Json
      }
      export_class_marks: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: Json
      }
      export_learners: { Args: { p_school_id: string }; Returns: Json }
      family_enrolment_years: {
        Args: { p_school_id: string }
        Returns: {
          class_name: string
          learner_id: string
          year_label: string
        }[]
      }
      generate_report_drafts: {
        Args: {
          p_class_id: string
          p_include_incomplete_results?: boolean
          p_term_id: string
        }
        Returns: {
          enrolment_id: string
          outcome: string
        }[]
      }
      grading_scale_is_complete: {
        Args: { p_scale_id: string }
        Returns: boolean
      }
      grading_scale_marked_class_subjects: {
        Args: { p_scale_id: string }
        Returns: {
          class_subjects: number
          term_id: string
          term_name: string
          term_status: Database["public"]["Enums"]["term_status"]
        }[]
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
      is_guardian_of: { Args: { p_learner_id: string }; Returns: boolean }
      is_own_learner: { Args: { p_learner_id: string }; Returns: boolean }
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
      mark_announcement_read: {
        Args: { p_announcement_id: string }
        Returns: boolean
      }
      marks_lock: {
        Args: { p_class_subject_id: string; p_term_id: string }
        Returns: {
          lock_reason: string
          marks_deadline: string
          teachers_locked: boolean
          unlock_reason: string
          unlocked_at: string
          unlocked_by_name: string
        }[]
      }
      marks_progress: {
        Args: { p_term_id: string }
        Returns: {
          assessments: number
          class_id: string
          class_name: string
          class_subject_id: string
          learners: number
          marks_entered: number
          subject_id: string
          subject_name: string
          teacher_id: string
          teacher_name: string
          total_weight: number
        }[]
      }
      marks_unlockers: {
        Args: { p_school_id: string }
        Returns: {
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      my_announcements: {
        Args: { p_school_id: string }
        Returns: {
          attachment_count: number
          audience: Database["public"]["Enums"]["audience_type"]
          author_name: string
          body: string
          class_id: string
          class_name: string
          expires_at: string
          id: string
          is_live: boolean
          is_unread: boolean
          pinned: boolean
          published_at: string
          status: Database["public"]["Enums"]["announcement_status"]
          title: string
        }[]
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
      my_news: {
        Args: { p_school_id: string }
        Returns: {
          attachment_count: number
          audience: Database["public"]["Enums"]["audience_type"]
          author_name: string
          body: string
          class_id: string
          class_name: string
          expires_at: string
          id: string
          is_live: boolean
          is_unread: boolean
          pinned: boolean
          published_at: string
          status: Database["public"]["Enums"]["announcement_status"]
          title: string
        }[]
      }
      my_news_summary: {
        Args: { p_school_id: string }
        Returns: {
          latest_id: string
          latest_title: string
          unread_count: number
        }[]
      }
      my_pending_invites: {
        Args: never
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          school_name: string
        }[]
      }
      my_report_shares: {
        Args: { p_report_id: string }
        Returns: {
          created_at: string
          expires_at: string
          opens: number
          share_id: string
        }[]
      }
      open_report_share: {
        Args: { p_token_hash: string }
        Returns: {
          pdf_path: string
          reference_code: string
          share_id: string
        }[]
      }
      oversight_counts: {
        Args: { p_school_id: string }
        Returns: {
          active_learners: number
          guardians: number
          guardians_never_signed_in: number
          parents_linked: number
          staff: number
        }[]
      }
      oversight_guardians: {
        Args: {
          p_filter: string
          p_limit?: number
          p_offset?: number
          p_school_id: string
        }
        Returns: {
          full_name: string
          guardian_id: string
          has_login: boolean
          last_sign_in_at: string
          learners: Json
          phone: string
          total: number
        }[]
      }
      oversight_reports: {
        Args: { p_term_id: string }
        Returns: {
          approved: number
          class_id: string
          class_name: string
          class_teacher_name: string
          drafts: number
          published: number
          returned: number
          submitted: number
          withdrawn: number
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
      portal_reports: {
        Args: { p_school_id: string }
        Returns: {
          class_name: string
          has_pdf: boolean
          is_own: boolean
          learner_id: string
          learner_name: string
          published_at: string
          report_id: string
          term_kind: Database["public"]["Enums"]["term_kind"]
          term_name: string
          version: number
          year_label: string
        }[]
      }
      publish_announcement: {
        Args: { p_announcement_id: string }
        Returns: undefined
      }
      publish_class_reports: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: number
      }
      redeem_parent_invite: { Args: { p_code_hash: string }; Returns: string }
      relock_class_subject: {
        Args: { p_class_subject_id: string; p_term_id: string }
        Returns: undefined
      }
      replace_recovery_codes: {
        Args: { p_hashes: string[]; p_user_id: string }
        Returns: undefined
      }
      report_changes_since_draft: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: {
          changed_at: string
          report_id: string
        }[]
      }
      report_class_overview: {
        Args: { p_term_id: string }
        Returns: {
          approved: number
          class_id: string
          class_name: string
          class_teacher_name: string
          drafts: number
          learners: number
          published: number
          returned: number
          submitted: number
        }[]
      }
      report_gaps: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: {
          assessment_names: string[]
          class_subject_id: string
          enrolment_id: string
          gap: string
          reason: string
          subject_name: string
        }[]
      }
      reset_two_factor: { Args: { p_user_id: string }; Returns: undefined }
      return_class_reports: {
        Args: { p_class_id: string; p_note: string; p_term_id: string }
        Returns: number
      }
      return_report: {
        Args: { p_note: string; p_report_id: string }
        Returns: undefined
      }
      revoke_report_share: { Args: { p_share_id: string }; Returns: undefined }
      roll_over_year: {
        Args: { p_apply?: boolean; p_plan: Json }
        Returns: Json
      }
      save_announcement: {
        Args: {
          p_announcement_id?: string
          p_audience: Database["public"]["Enums"]["audience_type"]
          p_body: string
          p_class_id?: string
          p_expires_at?: string
          p_pinned: boolean
          p_school_id: string
          p_title: string
        }
        Returns: string
      }
      save_assessment_set: {
        Args: {
          p_items: Json
          p_school_id: string
          p_term_kind: Database["public"]["Enums"]["term_kind"]
        }
        Returns: undefined
      }
      save_grading_bands: {
        Args: { p_bands: Json; p_scale_id: string }
        Returns: undefined
      }
      school_grading_status: {
        Args: { p_school_id: string }
        Returns: {
          complete: boolean
          grade_level_name: string
          scale_name: string
        }[]
      }
      school_onboarding: {
        Args: { p_school_id: string }
        Returns: {
          done: boolean
          item: string
          missing: number
        }[]
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
      school_usage: {
        Args: { p_school_id?: string }
        Returns: {
          active_learners: number
          active_parents: number
          active_staff: number
          attachments_bytes: number
          branding_bytes: number
          imports_bytes: number
          last_activity_at: string
          last_marks_at: string
          last_sign_in_at: string
          published_reports: number
          reports_bytes: number
          school_id: string
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
      set_primary_guardian: { Args: { p_link_id: string }; Returns: undefined }
      set_report_head_comment: {
        Args: { p_comment: string; p_report_id: string }
        Returns: undefined
      }
      set_report_result_not_available: {
        Args: {
          p_class_subject_id: string
          p_not_available: boolean
          p_report_id: string
        }
        Returns: undefined
      }
      set_school_feature: {
        Args: { p_feature: string; p_on: boolean; p_school_id: string }
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
      subject_results: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: {
          class_id: string
          class_subject_id: string
          enrolment_id: string
          grade: string
          grade_remark: string
          incomplete_reason: string
          result_status: string
          rounded_mark: number
          school_id: string
          subject_id: string
          term_id: string
          weighted_percent: number
        }[]
      }
      submit_class_reports: {
        Args: { p_class_id: string; p_term_id: string }
        Returns: number
      }
      teaches: { Args: { p_class_subject_id: string }; Returns: boolean }
      two_factor_status: {
        Args: { p_user_ids: string[] }
        Returns: {
          enrolled: boolean
          last_reset_at: string
          user_id: string
        }[]
      }
      unlock_class_subject: {
        Args: {
          p_class_subject_id: string
          p_reason: string
          p_term_id: string
        }
        Returns: string
      }
      update_staff_profile: {
        Args: {
          p_full_name: string
          p_phone: string
          p_school_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      use_recovery_code: {
        Args: { p_hash: string; p_user_id: string }
        Returns: boolean
      }
      withdraw_report: {
        Args: { p_reason: string; p_report_id: string }
        Returns: string
      }
    }
    Enums: {
      announcement_status: "draft" | "published" | "archived"
      app_role:
        | "school_admin"
        | "head"
        | "hod"
        | "teacher"
        | "parent"
        | "learner"
      assessment_type: "test" | "assignment" | "exam" | "practical" | "vacation"
      audience_type: "all" | "staff" | "learners" | "parents" | "class"
      audit_action: "insert" | "update" | "delete" | "event"
      comment_status: "draft" | "submitted"
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
      mark_status: "present" | "absent" | "excused"
      membership_status: "invited" | "active" | "disabled"
      report_status:
        | "draft"
        | "submitted"
        | "approved"
        | "published"
        | "withdrawn"
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
      announcement_status: ["draft", "published", "archived"],
      app_role: ["school_admin", "head", "hod", "teacher", "parent", "learner"],
      assessment_type: ["test", "assignment", "exam", "practical", "vacation"],
      audience_type: ["all", "staff", "learners", "parents", "class"],
      audit_action: ["insert", "update", "delete", "event"],
      comment_status: ["draft", "submitted"],
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
      mark_status: ["present", "absent", "excused"],
      membership_status: ["invited", "active", "disabled"],
      report_status: [
        "draft",
        "submitted",
        "approved",
        "published",
        "withdrawn",
      ],
      school_stage: ["primary", "secondary", "combined"],
      sex: ["F", "M"],
      term_kind: ["term", "vacation", "mock"],
      term_status: ["planned", "open", "locked", "closed"],
    },
  },
} as const

