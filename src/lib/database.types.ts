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
      assignment_status:
        | 'accepted'
        | 'completed_submitted'
        | 'confirmed'
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
          credit_reward: number;
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
          credit_reward?: number;
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
          status: Database['public']['Enums']['assignment_status'];
          accepted_at: string;
          completed_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          help_request_id: string;
          helper_id: string;
          status?: Database['public']['Enums']['assignment_status'];
          accepted_at?: string;
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
