// Archivo generado por scripts/gen-db-types.py — no editar a mano.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      academic_calendar: {
        Row: {id: string; course_id: string; kind: Database["public"]["Enums"]["calendar_kind"]; title_i18n: Json; starts_at: string; ends_at: string | null; created_by: string | null; created_at: string; updated_at: string; };
        Insert: {id?: string; course_id: string; kind?: Database["public"]["Enums"]["calendar_kind"]; title_i18n?: Json; starts_at: string; ends_at?: string | null; created_by?: string | null; created_at?: string; updated_at?: string; };
        Update: {id?: string; course_id?: string; kind?: Database["public"]["Enums"]["calendar_kind"]; title_i18n?: Json; starts_at?: string; ends_at?: string | null; created_by?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "academic_calendar_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "academic_calendar_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      activities: {
        Row: {id: string; course_id: string; module_id: string | null; lesson_id: string | null; type: Database["public"]["Enums"]["activity_type"]; status: Database["public"]["Enums"]["content_status"]; publish_at: string | null; due_at: string | null; allow_late: boolean; max_score: number; weight: number; original_locale: Database["public"]["Enums"]["locale_code"]; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null; };
        Insert: {id?: string; course_id: string; module_id?: string | null; lesson_id?: string | null; type: Database["public"]["Enums"]["activity_type"]; status?: Database["public"]["Enums"]["content_status"]; publish_at?: string | null; due_at?: string | null; allow_late?: boolean; max_score?: number; weight?: number; original_locale?: Database["public"]["Enums"]["locale_code"]; created_by?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Update: {id?: string; course_id?: string; module_id?: string | null; lesson_id?: string | null; type?: Database["public"]["Enums"]["activity_type"]; status?: Database["public"]["Enums"]["content_status"]; publish_at?: string | null; due_at?: string | null; allow_late?: boolean; max_score?: number; weight?: number; original_locale?: Database["public"]["Enums"]["locale_code"]; created_by?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Relationships: [{ foreignKeyName: "activities_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "activities_module_id_fkey"; columns: ["module_id"]; isOneToOne: false; referencedRelation: "modules"; referencedColumns: ["id"] }, { foreignKeyName: "activities_lesson_id_fkey"; columns: ["lesson_id"]; isOneToOne: false; referencedRelation: "lessons"; referencedColumns: ["id"] }, { foreignKeyName: "activities_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      activity_assignments: {
        Row: {activity_id: string; student_id: string; group_name: string | null; created_at: string; };
        Insert: {activity_id: string; student_id: string; group_name?: string | null; created_at?: string; };
        Update: {activity_id?: string; student_id?: string; group_name?: string | null; created_at?: string; };
        Relationships: [{ foreignKeyName: "activity_assignments_activity_id_fkey"; columns: ["activity_id"]; isOneToOne: false; referencedRelation: "activities"; referencedColumns: ["id"] }, { foreignKeyName: "activity_assignments_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      activity_options: {
        Row: {id: string; question_id: string; key: string; position: number; label_i18n: Json; };
        Insert: {id?: string; question_id: string; key: string; position?: number; label_i18n?: Json; };
        Update: {id?: string; question_id?: string; key?: string; position?: number; label_i18n?: Json; };
        Relationships: [{ foreignKeyName: "activity_options_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "activity_questions"; referencedColumns: ["id"] }];
      };
      activity_question_keys: {
        Row: {question_id: string; correct: Json; };
        Insert: {question_id: string; correct: Json; };
        Update: {question_id?: string; correct?: Json; };
        Relationships: [{ foreignKeyName: "activity_question_keys_question_id_fkey"; columns: ["question_id"]; isOneToOne: true; referencedRelation: "activity_questions"; referencedColumns: ["id"] }];
      };
      activity_questions: {
        Row: {id: string; activity_id: string; position: number; kind: Database["public"]["Enums"]["question_kind"]; prompt_i18n: Json; points: number; meta: Json; created_at: string; updated_at: string; };
        Insert: {id?: string; activity_id: string; position?: number; kind: Database["public"]["Enums"]["question_kind"]; prompt_i18n?: Json; points?: number; meta?: Json; created_at?: string; updated_at?: string; };
        Update: {id?: string; activity_id?: string; position?: number; kind?: Database["public"]["Enums"]["question_kind"]; prompt_i18n?: Json; points?: number; meta?: Json; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "activity_questions_activity_id_fkey"; columns: ["activity_id"]; isOneToOne: false; referencedRelation: "activities"; referencedColumns: ["id"] }];
      };
      activity_translations: {
        Row: {activity_id: string; locale: Database["public"]["Enums"]["locale_code"]; status: Database["public"]["Enums"]["translation_status"]; title: string; description: string; instructions: string; updated_by: string | null; created_at: string; updated_at: string; };
        Insert: {activity_id: string; locale: Database["public"]["Enums"]["locale_code"]; status?: Database["public"]["Enums"]["translation_status"]; title?: string; description?: string; instructions?: string; updated_by?: string | null; created_at?: string; updated_at?: string; };
        Update: {activity_id?: string; locale?: Database["public"]["Enums"]["locale_code"]; status?: Database["public"]["Enums"]["translation_status"]; title?: string; description?: string; instructions?: string; updated_by?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "activity_translations_activity_id_fkey"; columns: ["activity_id"]; isOneToOne: false; referencedRelation: "activities"; referencedColumns: ["id"] }, { foreignKeyName: "activity_translations_updated_by_fkey"; columns: ["updated_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      announcement_translations: {
        Row: {announcement_id: string; locale: Database["public"]["Enums"]["locale_code"]; status: Database["public"]["Enums"]["translation_status"]; title: string; body: string; updated_at: string; };
        Insert: {announcement_id: string; locale: Database["public"]["Enums"]["locale_code"]; status?: Database["public"]["Enums"]["translation_status"]; title?: string; body?: string; updated_at?: string; };
        Update: {announcement_id?: string; locale?: Database["public"]["Enums"]["locale_code"]; status?: Database["public"]["Enums"]["translation_status"]; title?: string; body?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "announcement_translations_announcement_id_fkey"; columns: ["announcement_id"]; isOneToOne: false; referencedRelation: "announcements"; referencedColumns: ["id"] }];
      };
      announcements: {
        Row: {id: string; course_id: string | null; author_id: string; status: Database["public"]["Enums"]["content_status"]; publish_at: string | null; pinned: boolean; original_locale: Database["public"]["Enums"]["locale_code"]; created_at: string; updated_at: string; deleted_at: string | null; };
        Insert: {id?: string; course_id?: string | null; author_id: string; status?: Database["public"]["Enums"]["content_status"]; publish_at?: string | null; pinned?: boolean; original_locale?: Database["public"]["Enums"]["locale_code"]; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Update: {id?: string; course_id?: string | null; author_id?: string; status?: Database["public"]["Enums"]["content_status"]; publish_at?: string | null; pinned?: boolean; original_locale?: Database["public"]["Enums"]["locale_code"]; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Relationships: [{ foreignKeyName: "announcements_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "announcements_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      assessment_answers: {
        Row: {attempt_id: string; question_id: string; answer: Json; auto_score: number | null; manual_score: number | null; };
        Insert: {attempt_id: string; question_id: string; answer: Json; auto_score?: number | null; manual_score?: number | null; };
        Update: {attempt_id?: string; question_id?: string; answer?: Json; auto_score?: number | null; manual_score?: number | null; };
        Relationships: [{ foreignKeyName: "assessment_answers_attempt_id_fkey"; columns: ["attempt_id"]; isOneToOne: false; referencedRelation: "assessment_attempts"; referencedColumns: ["id"] }, { foreignKeyName: "assessment_answers_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "assessment_questions"; referencedColumns: ["id"] }];
      };
      assessment_attempts: {
        Row: {id: string; assessment_id: string; student_id: string; attempt_no: number; question_ids: (string)[]; status: Database["public"]["Enums"]["attempt_status"]; started_at: string; deadline_at: string | null; submitted_at: string | null; score: number | null; max_score: number; feedback: string; created_at: string; updated_at: string; };
        Insert: {id?: string; assessment_id: string; student_id: string; attempt_no: number; question_ids: (string)[]; status?: Database["public"]["Enums"]["attempt_status"]; started_at?: string; deadline_at?: string | null; submitted_at?: string | null; score?: number | null; max_score?: number; feedback?: string; created_at?: string; updated_at?: string; };
        Update: {id?: string; assessment_id?: string; student_id?: string; attempt_no?: number; question_ids?: (string)[]; status?: Database["public"]["Enums"]["attempt_status"]; started_at?: string; deadline_at?: string | null; submitted_at?: string | null; score?: number | null; max_score?: number; feedback?: string; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "assessment_attempts_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "assessment_attempts_assessment_id_fkey"; columns: ["assessment_id"]; isOneToOne: false; referencedRelation: "assessments"; referencedColumns: ["id"] }];
      };
      assessment_question_keys: {
        Row: {question_id: string; correct: Json; };
        Insert: {question_id: string; correct: Json; };
        Update: {question_id?: string; correct?: Json; };
        Relationships: [{ foreignKeyName: "assessment_question_keys_question_id_fkey"; columns: ["question_id"]; isOneToOne: true; referencedRelation: "assessment_questions"; referencedColumns: ["id"] }];
      };
      assessment_questions: {
        Row: {id: string; assessment_id: string; position: number; kind: Database["public"]["Enums"]["question_kind"]; prompt_i18n: Json; options: Json; meta: Json; points: number; created_at: string; updated_at: string; };
        Insert: {id?: string; assessment_id: string; position?: number; kind: Database["public"]["Enums"]["question_kind"]; prompt_i18n?: Json; options?: Json; meta?: Json; points?: number; created_at?: string; updated_at?: string; };
        Update: {id?: string; assessment_id?: string; position?: number; kind?: Database["public"]["Enums"]["question_kind"]; prompt_i18n?: Json; options?: Json; meta?: Json; points?: number; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "assessment_questions_assessment_id_fkey"; columns: ["assessment_id"]; isOneToOne: false; referencedRelation: "assessments"; referencedColumns: ["id"] }];
      };
      assessments: {
        Row: {id: string; course_id: string; module_id: string | null; title_i18n: Json; description_i18n: Json; status: Database["public"]["Enums"]["content_status"]; opens_at: string | null; closes_at: string | null; time_limit_minutes: number | null; max_attempts: number; random_question_count: number | null; shuffle: boolean; weight: number; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null; };
        Insert: {id?: string; course_id: string; module_id?: string | null; title_i18n?: Json; description_i18n?: Json; status?: Database["public"]["Enums"]["content_status"]; opens_at?: string | null; closes_at?: string | null; time_limit_minutes?: number | null; max_attempts?: number; random_question_count?: number | null; shuffle?: boolean; weight?: number; created_by?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Update: {id?: string; course_id?: string; module_id?: string | null; title_i18n?: Json; description_i18n?: Json; status?: Database["public"]["Enums"]["content_status"]; opens_at?: string | null; closes_at?: string | null; time_limit_minutes?: number | null; max_attempts?: number; random_question_count?: number | null; shuffle?: boolean; weight?: number; created_by?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Relationships: [{ foreignKeyName: "assessments_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "assessments_module_id_fkey"; columns: ["module_id"]; isOneToOne: false; referencedRelation: "modules"; referencedColumns: ["id"] }, { foreignKeyName: "assessments_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      attendance_records: {
        Row: {session_id: string; student_id: string; status: Database["public"]["Enums"]["attendance_status"]; note: string; recorded_by: string | null; updated_at: string; };
        Insert: {session_id: string; student_id: string; status: Database["public"]["Enums"]["attendance_status"]; note?: string; recorded_by?: string | null; updated_at?: string; };
        Update: {session_id?: string; student_id?: string; status?: Database["public"]["Enums"]["attendance_status"]; note?: string; recorded_by?: string | null; updated_at?: string; };
        Relationships: [{ foreignKeyName: "attendance_records_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "attendance_sessions"; referencedColumns: ["id"] }, { foreignKeyName: "attendance_records_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "attendance_records_recorded_by_fkey"; columns: ["recorded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      attendance_sessions: {
        Row: {id: string; course_id: string; lesson_id: string | null; session_date: string; notes: string; created_at: string; updated_at: string; };
        Insert: {id?: string; course_id: string; lesson_id?: string | null; session_date: string; notes?: string; created_at?: string; updated_at?: string; };
        Update: {id?: string; course_id?: string; lesson_id?: string | null; session_date?: string; notes?: string; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "attendance_sessions_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "attendance_sessions_lesson_id_fkey"; columns: ["lesson_id"]; isOneToOne: false; referencedRelation: "lessons"; referencedColumns: ["id"] }];
      };
      audit_logs: {
        Row: {id: number; actor_id: string | null; action: string; entity: string; entity_id: string | null; data: Json; created_at: string; };
        Insert: {actor_id?: string | null; action: string; entity: string; entity_id?: string | null; data?: Json; created_at?: string; };
        Update: {actor_id?: string | null; action?: string; entity?: string; entity_id?: string | null; data?: Json; created_at?: string; };
        Relationships: [];
      };
      conversations: {
        Row: {id: string; course_id: string; teacher_id: string; student_id: string; last_message_at: string | null; created_at: string; };
        Insert: {id?: string; course_id: string; teacher_id: string; student_id: string; last_message_at?: string | null; created_at?: string; };
        Update: {id?: string; course_id?: string; teacher_id?: string; student_id?: string; last_message_at?: string | null; created_at?: string; };
        Relationships: [{ foreignKeyName: "conversations_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "conversations_teacher_id_fkey"; columns: ["teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "conversations_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      countries: {
        Row: {code: string; name_i18n: Json; default_locale: Database["public"]["Enums"]["locale_code"]; locales: (Database["public"]["Enums"]["locale_code"])[]; currencies: (string)[]; timezone: string; date_format: string; national_id_kind: string; config: Json; active: boolean; created_at: string; updated_at: string; };
        Insert: {code: string; name_i18n?: Json; default_locale: Database["public"]["Enums"]["locale_code"]; locales: (Database["public"]["Enums"]["locale_code"])[]; currencies: (string)[]; timezone: string; date_format?: string; national_id_kind?: string; config?: Json; active?: boolean; created_at?: string; updated_at?: string; };
        Update: {code?: string; name_i18n?: Json; default_locale?: Database["public"]["Enums"]["locale_code"]; locales?: (Database["public"]["Enums"]["locale_code"])[]; currencies?: (string)[]; timezone?: string; date_format?: string; national_id_kind?: string; config?: Json; active?: boolean; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      country_admins: {
        Row: {country_code: string; user_id: string; created_at: string; };
        Insert: {country_code: string; user_id: string; created_at?: string; };
        Update: {country_code?: string; user_id?: string; created_at?: string; };
        Relationships: [{ foreignKeyName: "country_admins_country_code_fkey"; columns: ["country_code"]; isOneToOne: false; referencedRelation: "countries"; referencedColumns: ["code"] }, { foreignKeyName: "country_admins_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      course_members: {
        Row: {course_id: string; student_id: string; status: string; enrolled_at: string; updated_at: string; };
        Insert: {course_id: string; student_id: string; status?: string; enrolled_at?: string; updated_at?: string; };
        Update: {course_id?: string; student_id?: string; status?: string; enrolled_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "course_members_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "course_members_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      courses: {
        Row: {id: string; name: string; description: string; owner_teacher_id: string; start_date: string | null; end_date: string | null; status: Database["public"]["Enums"]["course_status"]; cover_key: string | null; languages: (Database["public"]["Enums"]["locale_code"])[]; grade_scale_id: string | null; created_at: string; updated_at: string; deleted_at: string | null; institution_id: string; level_key: string | null; grade_key: string | null; };
        Insert: {id?: string; name: string; description?: string; owner_teacher_id: string; start_date?: string | null; end_date?: string | null; status?: Database["public"]["Enums"]["course_status"]; cover_key?: string | null; languages?: (Database["public"]["Enums"]["locale_code"])[]; grade_scale_id?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; institution_id: string; level_key?: string | null; grade_key?: string | null; };
        Update: {id?: string; name?: string; description?: string; owner_teacher_id?: string; start_date?: string | null; end_date?: string | null; status?: Database["public"]["Enums"]["course_status"]; cover_key?: string | null; languages?: (Database["public"]["Enums"]["locale_code"])[]; grade_scale_id?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; institution_id?: string; level_key?: string | null; grade_key?: string | null; };
        Relationships: [{ foreignKeyName: "courses_owner_teacher_id_fkey"; columns: ["owner_teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "courses_grade_scale_id_fkey"; columns: ["grade_scale_id"]; isOneToOne: false; referencedRelation: "grade_scales"; referencedColumns: ["id"] }, { foreignKeyName: "courses_institution_id_fkey"; columns: ["institution_id"]; isOneToOne: false; referencedRelation: "institutions"; referencedColumns: ["id"] }];
      };
      grade_scales: {
        Row: {id: string; name: string; country: string; min_grade: number; max_grade: number; pass_grade: number; exigency: number; decimals: number; is_default: boolean; created_at: string; updated_at: string; };
        Insert: {id?: string; name: string; country?: string; min_grade: number; max_grade: number; pass_grade: number; exigency?: number; decimals?: number; is_default?: boolean; created_at?: string; updated_at?: string; };
        Update: {id?: string; name?: string; country?: string; min_grade?: number; max_grade?: number; pass_grade?: number; exigency?: number; decimals?: number; is_default?: boolean; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      grades: {
        Row: {id: string; course_id: string; student_id: string; activity_id: string | null; assessment_id: string | null; title: string; score: number; max_score: number; grade: number | null; weight: number; observation: string; graded_by: string | null; created_at: string; updated_at: string; };
        Insert: {id?: string; course_id: string; student_id: string; activity_id?: string | null; assessment_id?: string | null; title?: string; score: number; max_score: number; grade?: number | null; weight?: number; observation?: string; graded_by?: string | null; created_at?: string; updated_at?: string; };
        Update: {id?: string; course_id?: string; student_id?: string; activity_id?: string | null; assessment_id?: string | null; title?: string; score?: number; max_score?: number; grade?: number | null; weight?: number; observation?: string; graded_by?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "grades_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "grades_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "grades_activity_id_fkey"; columns: ["activity_id"]; isOneToOne: false; referencedRelation: "activities"; referencedColumns: ["id"] }, { foreignKeyName: "grades_assessment_id_fkey"; columns: ["assessment_id"]; isOneToOne: false; referencedRelation: "assessments"; referencedColumns: ["id"] }, { foreignKeyName: "grades_graded_by_fkey"; columns: ["graded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      guardian_links: {
        Row: {institution_id: string; guardian_id: string; student_id: string; relationship: string; created_at: string; };
        Insert: {institution_id: string; guardian_id: string; student_id: string; relationship?: string; created_at?: string; };
        Update: {institution_id?: string; guardian_id?: string; student_id?: string; relationship?: string; created_at?: string; };
        Relationships: [{ foreignKeyName: "guardian_links_institution_id_fkey"; columns: ["institution_id"]; isOneToOne: false; referencedRelation: "institutions"; referencedColumns: ["id"] }, { foreignKeyName: "guardian_links_guardian_id_fkey"; columns: ["guardian_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "guardian_links_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      institution_members: {
        Row: {institution_id: string; user_id: string; role: Database["public"]["Enums"]["institution_role"]; status: string; created_at: string; updated_at: string; };
        Insert: {institution_id: string; user_id: string; role: Database["public"]["Enums"]["institution_role"]; status?: string; created_at?: string; updated_at?: string; };
        Update: {institution_id?: string; user_id?: string; role?: Database["public"]["Enums"]["institution_role"]; status?: string; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "institution_members_institution_id_fkey"; columns: ["institution_id"]; isOneToOne: false; referencedRelation: "institutions"; referencedColumns: ["id"] }, { foreignKeyName: "institution_members_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      institutions: {
        Row: {id: string; country_code: string; name: string; short_name: string; legal_id: string | null; official_code: string | null; levels: (string)[]; settings: Json; status: string; created_at: string; updated_at: string; };
        Insert: {id?: string; country_code: string; name: string; short_name?: string; legal_id?: string | null; official_code?: string | null; levels?: (string)[]; settings?: Json; status?: string; created_at?: string; updated_at?: string; };
        Update: {id?: string; country_code?: string; name?: string; short_name?: string; legal_id?: string | null; official_code?: string | null; levels?: (string)[]; settings?: Json; status?: string; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "institutions_country_code_fkey"; columns: ["country_code"]; isOneToOne: false; referencedRelation: "countries"; referencedColumns: ["code"] }];
      };
      lesson_materials: {
        Row: {lesson_id: string; material_id: string; position: number; created_at: string; };
        Insert: {lesson_id: string; material_id: string; position?: number; created_at?: string; };
        Update: {lesson_id?: string; material_id?: string; position?: number; created_at?: string; };
        Relationships: [{ foreignKeyName: "lesson_materials_lesson_id_fkey"; columns: ["lesson_id"]; isOneToOne: false; referencedRelation: "lessons"; referencedColumns: ["id"] }, { foreignKeyName: "lesson_materials_material_id_fkey"; columns: ["material_id"]; isOneToOne: false; referencedRelation: "materials"; referencedColumns: ["id"] }];
      };
      lesson_progress: {
        Row: {lesson_id: string; student_id: string; first_viewed_at: string; last_viewed_at: string; view_count: number; completed_at: string | null; };
        Insert: {lesson_id: string; student_id: string; first_viewed_at?: string; last_viewed_at?: string; view_count?: number; completed_at?: string | null; };
        Update: {lesson_id?: string; student_id?: string; first_viewed_at?: string; last_viewed_at?: string; view_count?: number; completed_at?: string | null; };
        Relationships: [{ foreignKeyName: "lesson_progress_lesson_id_fkey"; columns: ["lesson_id"]; isOneToOne: false; referencedRelation: "lessons"; referencedColumns: ["id"] }, { foreignKeyName: "lesson_progress_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      lesson_translations: {
        Row: {lesson_id: string; locale: Database["public"]["Enums"]["locale_code"]; status: Database["public"]["Enums"]["translation_status"]; title: string; general_objective: string; specific_objectives: string; competencies: string; expected_learning: string; contents: string; introduction: string; development: string; closing: string; practical_activity: string; evaluation: string; complementary: string; links: Json; updated_by: string | null; created_at: string; updated_at: string; };
        Insert: {lesson_id: string; locale: Database["public"]["Enums"]["locale_code"]; status?: Database["public"]["Enums"]["translation_status"]; title?: string; general_objective?: string; specific_objectives?: string; competencies?: string; expected_learning?: string; contents?: string; introduction?: string; development?: string; closing?: string; practical_activity?: string; evaluation?: string; complementary?: string; links?: Json; updated_by?: string | null; created_at?: string; updated_at?: string; };
        Update: {lesson_id?: string; locale?: Database["public"]["Enums"]["locale_code"]; status?: Database["public"]["Enums"]["translation_status"]; title?: string; general_objective?: string; specific_objectives?: string; competencies?: string; expected_learning?: string; contents?: string; introduction?: string; development?: string; closing?: string; practical_activity?: string; evaluation?: string; complementary?: string; links?: Json; updated_by?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "lesson_translations_lesson_id_fkey"; columns: ["lesson_id"]; isOneToOne: false; referencedRelation: "lessons"; referencedColumns: ["id"] }, { foreignKeyName: "lesson_translations_updated_by_fkey"; columns: ["updated_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      lessons: {
        Row: {id: string; course_id: string; module_id: string; number: number; scheduled_date: string | null; duration_minutes: number | null; status: Database["public"]["Enums"]["content_status"]; publish_at: string | null; original_locale: Database["public"]["Enums"]["locale_code"]; version: number; created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null; };
        Insert: {id?: string; course_id: string; module_id: string; number?: number; scheduled_date?: string | null; duration_minutes?: number | null; status?: Database["public"]["Enums"]["content_status"]; publish_at?: string | null; original_locale?: Database["public"]["Enums"]["locale_code"]; version?: number; created_by?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Update: {id?: string; course_id?: string; module_id?: string; number?: number; scheduled_date?: string | null; duration_minutes?: number | null; status?: Database["public"]["Enums"]["content_status"]; publish_at?: string | null; original_locale?: Database["public"]["Enums"]["locale_code"]; version?: number; created_by?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Relationships: [{ foreignKeyName: "lessons_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "lessons_module_id_course_id_fkey"; columns: ["module_id", "course_id"]; isOneToOne: false; referencedRelation: "modules"; referencedColumns: ["id", "course_id"] }];
      };
      material_access_logs: {
        Row: {id: number; material_id: string; user_id: string; action: string; created_at: string; };
        Insert: {material_id: string; user_id: string; action: string; created_at?: string; };
        Update: {material_id?: string; user_id?: string; action?: string; created_at?: string; };
        Relationships: [{ foreignKeyName: "material_access_logs_material_id_fkey"; columns: ["material_id"]; isOneToOne: false; referencedRelation: "materials"; referencedColumns: ["id"] }, { foreignKeyName: "material_access_logs_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      material_folders: {
        Row: {id: string; course_id: string; parent_id: string | null; name: string; position: number; created_at: string; updated_at: string; };
        Insert: {id?: string; course_id: string; parent_id?: string | null; name: string; position?: number; created_at?: string; updated_at?: string; };
        Update: {id?: string; course_id?: string; parent_id?: string | null; name?: string; position?: number; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "material_folders_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "material_folders_parent_id_fkey"; columns: ["parent_id"]; isOneToOne: false; referencedRelation: "material_folders"; referencedColumns: ["id"] }];
      };
      materials: {
        Row: {id: string; course_id: string; folder_id: string | null; title: string; description: string; object_key: string; original_name: string; mime_type: string; size_bytes: number; visibility: string; status: string; uploaded_by: string | null; created_at: string; updated_at: string; deleted_at: string | null; };
        Insert: {id?: string; course_id: string; folder_id?: string | null; title: string; description?: string; object_key: string; original_name: string; mime_type: string; size_bytes: number; visibility?: string; status?: string; uploaded_by?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Update: {id?: string; course_id?: string; folder_id?: string | null; title?: string; description?: string; object_key?: string; original_name?: string; mime_type?: string; size_bytes?: number; visibility?: string; status?: string; uploaded_by?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Relationships: [{ foreignKeyName: "materials_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "materials_folder_id_fkey"; columns: ["folder_id"]; isOneToOne: false; referencedRelation: "material_folders"; referencedColumns: ["id"] }, { foreignKeyName: "materials_uploaded_by_fkey"; columns: ["uploaded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      messages: {
        Row: {id: string; conversation_id: string; sender_id: string; body: string; read_at: string | null; created_at: string; };
        Insert: {id?: string; conversation_id: string; sender_id: string; body: string; read_at?: string | null; created_at?: string; };
        Update: {id?: string; conversation_id?: string; sender_id?: string; body?: string; read_at?: string | null; created_at?: string; };
        Relationships: [{ foreignKeyName: "messages_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "conversations"; referencedColumns: ["id"] }, { foreignKeyName: "messages_sender_id_fkey"; columns: ["sender_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      modules: {
        Row: {id: string; course_id: string; position: number; title_i18n: Json; description_i18n: Json; status: Database["public"]["Enums"]["content_status"]; created_at: string; updated_at: string; deleted_at: string | null; };
        Insert: {id?: string; course_id: string; position?: number; title_i18n?: Json; description_i18n?: Json; status?: Database["public"]["Enums"]["content_status"]; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Update: {id?: string; course_id?: string; position?: number; title_i18n?: Json; description_i18n?: Json; status?: Database["public"]["Enums"]["content_status"]; created_at?: string; updated_at?: string; deleted_at?: string | null; };
        Relationships: [{ foreignKeyName: "modules_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }];
      };
      notifications: {
        Row: {id: string; user_id: string; kind: string; payload: Json; link: string | null; visible_at: string; read_at: string | null; created_at: string; };
        Insert: {id?: string; user_id: string; kind: string; payload?: Json; link?: string | null; visible_at?: string; read_at?: string | null; created_at?: string; };
        Update: {id?: string; user_id?: string; kind?: string; payload?: Json; link?: string | null; visible_at?: string; read_at?: string | null; created_at?: string; };
        Relationships: [{ foreignKeyName: "notifications_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      profiles: {
        Row: {id: string; email: string; first_name: string; last_name: string; internal_code: string | null; avatar_key: string | null; joined_on: string; status: Database["public"]["Enums"]["user_status"]; locale: Database["public"]["Enums"]["locale_code"]; created_at: string; updated_at: string; deleted_at: string | null; must_change_password: boolean; national_id: string | null; national_id_country: string | null; };
        Insert: {id: string; email: string; first_name?: string; last_name?: string; internal_code?: string | null; avatar_key?: string | null; joined_on?: string; status?: Database["public"]["Enums"]["user_status"]; locale?: Database["public"]["Enums"]["locale_code"]; created_at?: string; updated_at?: string; deleted_at?: string | null; must_change_password?: boolean; national_id?: string | null; national_id_country?: string | null; };
        Update: {id?: string; email?: string; first_name?: string; last_name?: string; internal_code?: string | null; avatar_key?: string | null; joined_on?: string; status?: Database["public"]["Enums"]["user_status"]; locale?: Database["public"]["Enums"]["locale_code"]; created_at?: string; updated_at?: string; deleted_at?: string | null; must_change_password?: boolean; national_id?: string | null; national_id_country?: string | null; };
        Relationships: [{ foreignKeyName: "profiles_national_id_country_fkey"; columns: ["national_id_country"]; isOneToOne: false; referencedRelation: "countries"; referencedColumns: ["code"] }];
      };
      roles: {
        Row: {key: string; name_i18n: Json; created_at: string; };
        Insert: {key: string; name_i18n?: Json; created_at?: string; };
        Update: {key?: string; name_i18n?: Json; created_at?: string; };
        Relationships: [];
      };
      student_notes: {
        Row: {id: string; course_id: string; student_id: string; author_id: string; body: string; visible_to_student: boolean; created_at: string; };
        Insert: {id?: string; course_id: string; student_id: string; author_id: string; body: string; visible_to_student?: boolean; created_at?: string; };
        Update: {id?: string; course_id?: string; student_id?: string; author_id?: string; body?: string; visible_to_student?: boolean; created_at?: string; };
        Relationships: [{ foreignKeyName: "student_notes_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "student_notes_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "student_notes_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      submission_answers: {
        Row: {submission_id: string; question_id: string; answer: Json; auto_score: number | null; manual_score: number | null; };
        Insert: {submission_id: string; question_id: string; answer: Json; auto_score?: number | null; manual_score?: number | null; };
        Update: {submission_id?: string; question_id?: string; answer?: Json; auto_score?: number | null; manual_score?: number | null; };
        Relationships: [{ foreignKeyName: "submission_answers_submission_id_fkey"; columns: ["submission_id"]; isOneToOne: false; referencedRelation: "submissions"; referencedColumns: ["id"] }, { foreignKeyName: "submission_answers_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "activity_questions"; referencedColumns: ["id"] }];
      };
      submission_comments: {
        Row: {id: string; submission_id: string; author_id: string; body: string; created_at: string; };
        Insert: {id?: string; submission_id: string; author_id: string; body: string; created_at?: string; };
        Update: {id?: string; submission_id?: string; author_id?: string; body?: string; created_at?: string; };
        Relationships: [{ foreignKeyName: "submission_comments_submission_id_fkey"; columns: ["submission_id"]; isOneToOne: false; referencedRelation: "submissions"; referencedColumns: ["id"] }, { foreignKeyName: "submission_comments_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      submission_files: {
        Row: {id: string; submission_id: string; object_key: string; original_name: string; mime_type: string; size_bytes: number; created_at: string; };
        Insert: {id?: string; submission_id: string; object_key: string; original_name: string; mime_type: string; size_bytes: number; created_at?: string; };
        Update: {id?: string; submission_id?: string; object_key?: string; original_name?: string; mime_type?: string; size_bytes?: number; created_at?: string; };
        Relationships: [{ foreignKeyName: "submission_files_submission_id_fkey"; columns: ["submission_id"]; isOneToOne: false; referencedRelation: "submissions"; referencedColumns: ["id"] }];
      };
      submissions: {
        Row: {id: string; activity_id: string; student_id: string; status: Database["public"]["Enums"]["submission_status"]; text_answer: string; submitted_at: string | null; is_late: boolean; score: number | null; feedback: string; graded_by: string | null; graded_at: string | null; created_at: string; updated_at: string; };
        Insert: {id?: string; activity_id: string; student_id: string; status?: Database["public"]["Enums"]["submission_status"]; text_answer?: string; submitted_at?: string | null; is_late?: boolean; score?: number | null; feedback?: string; graded_by?: string | null; graded_at?: string | null; created_at?: string; updated_at?: string; };
        Update: {id?: string; activity_id?: string; student_id?: string; status?: Database["public"]["Enums"]["submission_status"]; text_answer?: string; submitted_at?: string | null; is_late?: boolean; score?: number | null; feedback?: string; graded_by?: string | null; graded_at?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [{ foreignKeyName: "submissions_activity_id_fkey"; columns: ["activity_id"]; isOneToOne: false; referencedRelation: "activities"; referencedColumns: ["id"] }, { foreignKeyName: "submissions_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "submissions_graded_by_fkey"; columns: ["graded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      system_settings: {
        Row: {key: string; value: Json; updated_at: string; };
        Insert: {key: string; value: Json; updated_at?: string; };
        Update: {key?: string; value?: Json; updated_at?: string; };
        Relationships: [];
      };
      teacher_assignments: {
        Row: {course_id: string; teacher_id: string; created_at: string; };
        Insert: {course_id: string; teacher_id: string; created_at?: string; };
        Update: {course_id?: string; teacher_id?: string; created_at?: string; };
        Relationships: [{ foreignKeyName: "teacher_assignments_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "teacher_assignments_teacher_id_fkey"; columns: ["teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      user_preferences: {
        Row: {user_id: string; theme: string; locale: Database["public"]["Enums"]["locale_code"]; updated_at: string; };
        Insert: {user_id: string; theme?: string; locale?: Database["public"]["Enums"]["locale_code"]; updated_at?: string; };
        Update: {user_id?: string; theme?: string; locale?: Database["public"]["Enums"]["locale_code"]; updated_at?: string; };
        Relationships: [{ foreignKeyName: "user_preferences_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      user_roles: {
        Row: {user_id: string; role_key: string; created_at: string; };
        Insert: {user_id: string; role_key: string; created_at?: string; };
        Update: {user_id?: string; role_key?: string; created_at?: string; };
        Relationships: [{ foreignKeyName: "user_roles_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "user_roles_role_key_fkey"; columns: ["role_key"]; isOneToOne: false; referencedRelation: "roles"; referencedColumns: ["key"] }];
      };
    };
    Views: {
      calendar_events: { Row: {kind: string | null; course_id: string | null; ref_id: string | null; starts_at: string | null; ends_at: string | null; title_i18n: Json | null; link: string | null; }; Relationships: [] };
      student_progress: { Row: {course_id: string | null; student_id: string | null; lessons_total: number | null; lessons_viewed: number | null; lessons_completed: number | null; activities_total: number | null; activities_done: number | null; grade_avg: number | null; attendance_pct: number | null; downloads: number | null; }; Relationships: [] };
    };
    Functions: {
      clear_password_flag: { Args: {  }; Returns: undefined };
      course_stats: { Args: { p_course: string; }; Returns: Json };
      grade_attempt: { Args: { p_attempt: string; p_scores: Json; p_feedback?: string; }; Returns: Database["public"]["Tables"]["assessment_attempts"]["Row"] };
      guardian_overview: { Args: {  }; Returns: unknown[] };
      mark_notifications_read: { Args: { p_ids?: string[]; }; Returns: undefined };
      my_institutions: { Args: {  }; Returns: unknown[] };
      save_assessment_answers: { Args: { p_attempt: string; p_answers: Json; }; Returns: undefined };
      start_assessment: { Args: { p_assessment: string; }; Returns: Database["public"]["Tables"]["assessment_attempts"]["Row"] };
      submit_activity: { Args: { p_activity: string; p_answers?: Json; p_text?: string; p_final?: boolean; }; Returns: Database["public"]["Tables"]["submissions"]["Row"] };
      submit_assessment: { Args: { p_attempt: string; p_answers?: Json; }; Returns: Database["public"]["Tables"]["assessment_attempts"]["Row"] };
      track_lesson: { Args: { p_lesson: string; p_completed?: boolean; }; Returns: undefined };
    };
    Enums: {
      activity_type: "multiple_choice" | "true_false" | "open_question" | "fill_blanks" | "matching" | "ordering" | "research" | "practical" | "file_upload" | "group";
      attempt_status: "in_progress" | "submitted" | "graded";
      attendance_status: "present" | "absent" | "late" | "excused";
      calendar_kind: "class" | "lesson" | "assessment" | "deadline" | "announcement" | "event";
      content_status: "draft" | "scheduled" | "published" | "archived";
      course_status: "draft" | "active" | "archived";
      institution_role: "institution_admin" | "director" | "inspector" | "teacher" | "assistant" | "student" | "guardian";
      locale_code: "es" | "ht" | "fr";
      question_kind: "single_choice" | "multiple_choice" | "true_false" | "open" | "fill_blanks" | "matching" | "ordering";
      submission_status: "draft" | "submitted" | "graded" | "returned";
      translation_status: "draft" | "ai_proposed" | "approved";
      user_status: "active" | "inactive";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
