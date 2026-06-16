export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Enums: {
      user_role: 'requester' | 'helper' | 'mediator' | 'admin';
      request_source: 'voice' | 'admin_manual' | 'requester_form' | 'seed_demo';
      help_request_status:
        | 'draft'
        | 'pending_review'
        | 'published'
        | 'accepted'
        | 'completed_submitted'
        | 'confirmed'
        | 'credited'
        | 'closed'
        | 'rejected'
        | 'cancelled'
        | 'disputed'
        | 'expired';
      help_category:
        | 'electronics'
        | 'labor'
        | 'daily_life'
        | 'mobility_care'
        | 'household'
        | 'other';
      safety_tier: 'tier_1' | 'tier_2' | 'tier_3' | 'needs_review';
      assignment_status:
        | 'applied'
        | 'accepted'
        | 'completed_submitted'
        | 'confirmed'
        | 'rejected'
        | 'cancelled'
        | 'disputed';
      completion_proof_status: 'submitted' | 'approved' | 'rejected';
      review_source: 'happy_call' | 'admin_manual' | 'app';
      credit_reason:
        | 'task_completion'
        | 'review_bonus'
        | 'manual_adjustment'
        | 'redemption';
      call_direction: 'inbound' | 'outbound';
      call_purpose: 'intake' | 'match_confirmation' | 'happy_call';
      admin_call_task_status: 'pending' | 'completed';
      help_request_time_option_status: 'open' | 'locked' | 'closed';
      notification_channel:
        | 'kakao'
        | 'sms'
        | 'push'
        | 'voice'
        | 'email'
        | 'in_app';
      notification_status: 'pending' | 'sent' | 'failed' | 'skipped';
    };
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          role: Database['public']['Enums']['user_role'];
          name: string;
          phone: string | null;
          village: string;
          address_public: string | null;
          address_detail: string | null;
          latitude: number | null;
          longitude: number | null;
          personal_notes: string | null;
          consent_info: boolean | null;
          consent_voice: boolean | null;
          consent_photo: boolean | null;
          consent_doc_url: string | null;
          registered_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          role?: Database['public']['Enums']['user_role'];
          name: string;
          phone?: string | null;
          village?: string;
          address_public?: string | null;
          address_detail?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          personal_notes?: string | null;
          consent_info?: boolean | null;
          consent_voice?: boolean | null;
          consent_photo?: boolean | null;
          consent_doc_url?: string | null;
          registered_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      help_requests: {
        Row: {
          id: string;
          requester_id: string;
          approved_by: string | null;
          source: Database['public']['Enums']['request_source'];
          status: Database['public']['Enums']['help_request_status'];
          category: Database['public']['Enums']['help_category'];
          title: string;
          content: string;
          items_provided: boolean | null;
          items_needed_details: string | null;
          appointment_time: string | null;
          appointment_timezone: string;
          location_public: string | null;
          location_detail: string | null;
          location_latitude: number | null;
          location_longitude: number | null;
          credit_reward: number;
          required_helpers: number;
          safety_tier: Database['public']['Enums']['safety_tier'];
          reject_reason: string | null;
          rejected_at: string | null;
          estimated_duration_minutes: number;
          ai_extracted_payload: Json | null;
          admin_notes: string | null;
          created_at: string;
          updated_at: string;
          approved_at: string | null;
          published_at: string | null;
        };
        Insert: {
          id?: string;
          requester_id: string;
          approved_by?: string | null;
          source?: Database['public']['Enums']['request_source'];
          status?: Database['public']['Enums']['help_request_status'];
          category?: Database['public']['Enums']['help_category'];
          title: string;
          content: string;
          items_provided?: boolean | null;
          items_needed_details?: string | null;
          appointment_time?: string | null;
          appointment_timezone?: string;
          location_public?: string | null;
          location_detail?: string | null;
          location_latitude?: number | null;
          location_longitude?: number | null;
          credit_reward?: number;
          required_helpers?: number;
          safety_tier?: Database['public']['Enums']['safety_tier'];
          reject_reason?: string | null;
          rejected_at?: string | null;
          estimated_duration_minutes?: number;
          ai_extracted_payload?: Json | null;
          admin_notes?: string | null;
          created_at?: string;
          updated_at?: string;
          approved_at?: string | null;
          published_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['help_requests']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'help_requests_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'help_requests_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      assignments: {
        Row: {
          id: string;
          help_request_id: string;
          helper_id: string;
          time_option_id: string | null;
          status: Database['public']['Enums']['assignment_status'];
          applied_at: string;
          accepted_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          help_request_id: string;
          helper_id: string;
          time_option_id?: string | null;
          status?: Database['public']['Enums']['assignment_status'];
          applied_at?: string;
          accepted_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['assignments']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'assignments_help_request_id_fkey';
            columns: ['help_request_id'];
            isOneToOne: false;
            referencedRelation: 'help_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignments_helper_id_fkey';
            columns: ['helper_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      completion_proofs: {
        Row: {
          id: string;
          assignment_id: string;
          image_path: string;
          note: string | null;
          status: Database['public']['Enums']['completion_proof_status'];
          submitted_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          image_path: string;
          note?: string | null;
          status?: Database['public']['Enums']['completion_proof_status'];
          submitted_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['completion_proofs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'completion_proofs_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: false;
            referencedRelation: 'assignments';
            referencedColumns: ['id'];
          },
        ];
      };
      help_request_time_options: {
        Row: {
          id: string;
          help_request_id: string;
          label: string;
          starts_at: string;
          timezone: string;
          status: Database['public']['Enums']['help_request_time_option_status'];
          locked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          help_request_id: string;
          label: string;
          starts_at: string;
          timezone?: string;
          status?: Database['public']['Enums']['help_request_time_option_status'];
          locked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['help_request_time_options']['Insert']
        >;
        Relationships: [
          {
            foreignKeyName: 'help_request_time_options_help_request_id_fkey';
            columns: ['help_request_id'];
            isOneToOne: false;
            referencedRelation: 'help_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          assignment_id: string;
          requester_id: string;
          helper_id: string;
          rating: number | null;
          review_text: string | null;
          source: Database['public']['Enums']['review_source'];
          created_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          requester_id: string;
          helper_id: string;
          rating?: number | null;
          review_text?: string | null;
          source?: Database['public']['Enums']['review_source'];
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'reviews_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: true;
            referencedRelation: 'assignments';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_ledger: {
        Row: {
          id: string;
          profile_id: string;
          assignment_id: string | null;
          amount: number;
          reason: Database['public']['Enums']['credit_reason'];
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          assignment_id?: string | null;
          amount: number;
          reason: Database['public']['Enums']['credit_reason'];
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['credit_ledger']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'credit_ledger_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: false;
            referencedRelation: 'assignments';
            referencedColumns: ['id'];
          },
        ];
      };
      voice_calls: {
        Row: {
          id: string;
          provider: string | null;
          provider_call_id: string | null;
          direction: Database['public']['Enums']['call_direction'];
          phone: string;
          requester_id: string | null;
          help_request_id: string | null;
          purpose: Database['public']['Enums']['call_purpose'];
          status: string | null;
          transcript: string | null;
          raw_payload: Json | null;
          extracted_payload: Json | null;
          confidence: number | null;
          confirmed_by_requester: boolean | null;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider?: string | null;
          provider_call_id?: string | null;
          direction: Database['public']['Enums']['call_direction'];
          phone: string;
          requester_id?: string | null;
          help_request_id?: string | null;
          purpose: Database['public']['Enums']['call_purpose'];
          status?: string | null;
          transcript?: string | null;
          raw_payload?: Json | null;
          extracted_payload?: Json | null;
          confidence?: number | null;
          confirmed_by_requester?: boolean | null;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['voice_calls']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'voice_calls_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'voice_calls_help_request_id_fkey';
            columns: ['help_request_id'];
            isOneToOne: false;
            referencedRelation: 'help_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          recipient_profile_id: string | null;
          help_request_id: string | null;
          assignment_id: string | null;
          channel: Database['public']['Enums']['notification_channel'];
          purpose: string;
          status: Database['public']['Enums']['notification_status'];
          payload: Json | null;
          sent_at: string | null;
          failed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_profile_id?: string | null;
          help_request_id?: string | null;
          assignment_id?: string | null;
          channel: Database['public']['Enums']['notification_channel'];
          purpose: string;
          status?: Database['public']['Enums']['notification_status'];
          payload?: Json | null;
          sent_at?: string | null;
          failed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'notifications_recipient_profile_id_fkey';
            columns: ['recipient_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_help_request_id_fkey';
            columns: ['help_request_id'];
            isOneToOne: false;
            referencedRelation: 'help_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: false;
            referencedRelation: 'assignments';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_call_tasks: {
        Row: {
          id: string;
          help_request_id: string;
          requester_id: string;
          purpose: Database['public']['Enums']['call_purpose'];
          status: Database['public']['Enums']['admin_call_task_status'];
          requester_name: string;
          requester_phone: string;
          request_title: string;
          appointment_time: string | null;
          appointment_timezone: string;
          accepted_helper_count: number;
          accepted_helper_names: string[];
          call_script: string;
          admin_notes: string | null;
          no_answer_count: number;
          last_no_answer_at: string | null;
          completed_by: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          help_request_id: string;
          requester_id: string;
          purpose?: Database['public']['Enums']['call_purpose'];
          status?: Database['public']['Enums']['admin_call_task_status'];
          requester_name: string;
          requester_phone: string;
          request_title: string;
          appointment_time?: string | null;
          appointment_timezone?: string;
          accepted_helper_count?: number;
          accepted_helper_names?: string[];
          call_script: string;
          admin_notes?: string | null;
          no_answer_count?: number;
          last_no_answer_at?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['admin_call_tasks']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'admin_call_tasks_help_request_id_fkey';
            columns: ['help_request_id'];
            isOneToOne: false;
            referencedRelation: 'help_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_call_tasks_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_call_tasks_completed_by_fkey';
            columns: ['completed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_help_request: {
        Args: {
          p_help_request_id: string;
        };
        Returns: string;
      };
      complete_admin_call_task: {
        Args: {
          p_task_id: string;
          p_admin_notes?: string | null;
        };
        Returns: string;
      };
      log_admin_call_no_answer: {
        Args: {
          p_task_id: string;
          p_admin_notes?: string | null;
        };
        Returns: string;
      };
      queue_match_confirmation_call_task: {
        Args: {
          p_help_request_id: string;
        };
        Returns: string;
      };
      apply_help_request: {
        Args: {
          p_help_request_id: string;
          p_time_option_id?: string | null;
        };
        Returns: string;
      };
      approve_assignment: {
        Args: {
          p_assignment_id: string;
        };
        Returns: string;
      };
      approve_all_assignments_for_request: {
        Args: {
          p_help_request_id: string;
        };
        Returns: number;
      };
      cancel_help_application: {
        Args: {
          p_assignment_id: string;
        };
        Returns: string;
      };
      move_help_application_to_locked_option: {
        Args: {
          p_assignment_id: string;
        };
        Returns: string;
      };
      reject_assignment: {
        Args: {
          p_assignment_id: string;
          p_reason?: string | null;
        };
        Returns: string;
      };
      admin_update_help_request: {
        Args: {
          p_help_request_id: string;
          p_patch?: Json;
        };
        Returns: string;
      };
      calculate_help_credit: {
        Args: {
          p_category: Database['public']['Enums']['help_category'];
          p_duration_minutes: number;
          p_distance_meters?: number | null;
          p_review_bonus?: boolean | null;
        };
        Returns: number;
      };
      register_requester_profile: {
        Args: {
          p_name: string;
          p_phone: string;
          p_village?: string | null;
          p_address_public?: string | null;
          p_address_detail?: string | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_personal_notes?: string | null;
          p_consent_info?: boolean | null;
          p_consent_voice?: boolean | null;
          p_consent_photo?: boolean | null;
          p_consent_doc_url?: string | null;
        };
        Returns: string;
      };
      list_admin_requester_profiles: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          phone: string | null;
          village: string;
          address_public: string | null;
          address_detail: string | null;
          latitude: number | null;
          longitude: number | null;
          personal_notes: string | null;
          consent_info: boolean | null;
          consent_voice: boolean | null;
          consent_photo: boolean | null;
          consent_doc_url: string | null;
          registered_by: string | null;
          created_at: string;
        }[];
      };
      straight_line_distance_meters: {
        Args: {
          p_lat1: number | null;
          p_lon1: number | null;
          p_lat2: number | null;
          p_lon2: number | null;
        };
        Returns: number | null;
      };
      review_help_request: {
        Args: {
          p_help_request_id: string;
          p_status: Database['public']['Enums']['help_request_status'];
          p_reject_reason?: string | null;
        };
        Returns: string;
      };
      list_published_help_requests: {
        Args: {
          p_sort?: string | null;
          p_category?: Database['public']['Enums']['help_category'] | null;
          p_new_only?: boolean | null;
          p_limit?: number | null;
          p_offset?: number | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_search?: string | null;
        };
        Returns: {
          id: string;
          requester_id: string;
          source: Database['public']['Enums']['request_source'];
          status: Database['public']['Enums']['help_request_status'];
          category: Database['public']['Enums']['help_category'];
          title: string;
          content: string;
          items_provided: boolean | null;
          items_needed_details: string | null;
          appointment_time: string | null;
          appointment_timezone: string;
          location_public: string | null;
          credit_reward: number;
          required_helpers: number;
          safety_tier: Database['public']['Enums']['safety_tier'];
          location_latitude: number | null;
          location_longitude: number | null;
          estimated_duration_minutes: number;
          created_at: string;
          published_at: string | null;
          requester_name: string;
          requester_village: string;
          requester_address_public: string | null;
          distance_meters: number | null;
          is_new: boolean;
          applied_count: number;
          accepted_count: number;
          current_helper_assignment_id: string | null;
          current_helper_assignment_status:
            | Database['public']['Enums']['assignment_status']
            | null;
          application_deadline: string | null;
          applications_locked: boolean;
          is_full: boolean;
        }[];
      };
      finalize_help_request_match: {
        Args: {
          p_help_request_id: string;
          p_underfilled_reason?: string | null;
        };
        Returns: string;
      };
      mark_help_request_unfilled: {
        Args: {
          p_help_request_id: string;
          p_reason: string;
        };
        Returns: string;
      };
      get_help_request_matching_state: {
        Args: {
          p_help_request_id: string;
        };
        Returns: {
          help_request_id: string;
          status: Database['public']['Enums']['help_request_status'];
          required_helpers: number;
          minimum_helpers: number;
          capacity_helpers: number;
          applied_count: number;
          accepted_count: number;
          active_count: number;
          application_deadline: string | null;
          cancellation_deadline: string | null;
          application_deadline_passed: boolean;
          cancellation_locked: boolean;
          minimum_met: boolean;
          capacity_full: boolean;
          approval_ready: boolean;
          underfilled_at_deadline: boolean;
          must_fail_at_deadline: boolean;
        }[];
      };
      get_help_request_detail: {
        Args: {
          p_help_request_id: string;
          p_latitude?: number | null;
          p_longitude?: number | null;
        };
        Returns: {
          id: string;
          requester_id: string;
          source: Database['public']['Enums']['request_source'];
          status: Database['public']['Enums']['help_request_status'];
          category: Database['public']['Enums']['help_category'];
          title: string;
          content: string;
          items_provided: boolean | null;
          items_needed_details: string | null;
          appointment_time: string | null;
          appointment_timezone: string;
          location_public: string | null;
          location_detail: string | null;
          credit_reward: number;
          required_helpers: number;
          safety_tier: Database['public']['Enums']['safety_tier'];
          location_latitude: number | null;
          location_longitude: number | null;
          estimated_duration_minutes: number;
          created_at: string;
          published_at: string | null;
          requester_name: string;
          requester_phone: string | null;
          requester_village: string;
          requester_address_public: string | null;
          requester_address_detail: string | null;
          requester_personal_notes: string | null;
          distance_meters: number | null;
          is_new: boolean;
          applied_count: number;
          accepted_count: number;
          current_helper_assignment_id: string | null;
          current_helper_assignment_status:
            | Database['public']['Enums']['assignment_status']
            | null;
          current_helper_time_option_id: string | null;
          locked_time_option_id: string | null;
          time_options: Json;
          application_deadline: string | null;
          applications_locked: boolean;
          is_full: boolean;
          can_apply: boolean;
          apply_block_reason: string | null;
          application_state: string;
        }[];
      };
      refresh_matching_operational_alerts: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      list_my_helper_assignments: {
        Args: Record<PropertyKey, never>;
        Returns: {
          assignment: Json;
          help_request: Json;
          requester: Json;
          companion_helpers: Json;
          completion_proofs: Json;
          credit_ledger: Json;
        }[];
      };
      submit_completion: {
        Args: {
          p_assignment_id: string;
          p_image_path: string;
          p_note?: string | null;
        };
        Returns: string;
      };
      confirm_assignment_and_credit: {
        Args: {
          p_assignment_id: string;
          p_rating?: number | null;
          p_review_text?: string | null;
          p_source?: Database['public']['Enums']['review_source'];
        };
        Returns: string;
      };
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
