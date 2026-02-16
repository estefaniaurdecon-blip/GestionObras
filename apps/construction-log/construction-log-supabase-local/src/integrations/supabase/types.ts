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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      access_control_reports: {
        Row: {
          created_at: string
          created_by: string
          date: string
          id: string
          machinery_entries: Json
          observations: string | null
          organization_id: string
          personal_entries: Json
          responsible: string
          responsible_entry_time: string | null
          responsible_exit_time: string | null
          site_name: string
          updated_at: string
          work_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          date: string
          id?: string
          machinery_entries?: Json
          observations?: string | null
          organization_id: string
          personal_entries?: Json
          responsible: string
          responsible_entry_time?: string | null
          responsible_exit_time?: string | null
          site_name: string
          updated_at?: string
          work_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          machinery_entries?: Json
          observations?: string | null
          organization_id?: string
          personal_entries?: Json
          responsible?: string
          responsible_entry_time?: string | null
          responsible_exit_time?: string | null
          site_name?: string
          updated_at?: string
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_control_reports_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      app_versions: {
        Row: {
          created_at: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_mandatory: boolean | null
          platform: string
          published_by: string | null
          release_notes: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_mandatory?: boolean | null
          platform: string
          published_by?: string | null
          release_notes?: string | null
          version: string
        }
        Update: {
          created_at?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_mandatory?: boolean | null
          platform?: string
          published_by?: string | null
          release_notes?: string | null
          version?: string
        }
        Relationships: []
      }
      calendar_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_time: string | null
          id: string
          organization_id: string
          priority: string
          status: string
          task_date: string
          title: string
          updated_at: string
          work_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_time?: string | null
          id?: string
          organization_id: string
          priority?: string
          status?: string
          task_date: string
          title: string
          updated_at?: string
          work_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_time?: string | null
          id?: string
          organization_id?: string
          priority?: string
          status?: string
          task_date?: string
          title?: string
          updated_at?: string
          work_id?: string | null
        }
        Relationships: []
      }
      company_portfolio: {
        Row: {
          address: string | null
          city: string | null
          company_name: string
          company_type: string[]
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          created_by: string | null
          fiscal_id: string | null
          id: string
          notes: string | null
          organization_id: string
          postal_code: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name: string
          company_type: string[]
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          fiscal_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          postal_code?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string
          company_type?: string[]
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          fiscal_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          postal_code?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_portfolio_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_logo: string | null
          company_name: string | null
          created_at: string | null
          id: string
          organization_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_logo?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_logo?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_types: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          type_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          type_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          type_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          name: string
          organization_id: string
          region: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          name: string
          organization_id: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          name?: string
          organization_id?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_note_id: string | null
          delivery_note_number: string | null
          id: string
          inventory_item_id: string | null
          is_immediate_consumption: boolean
          item_category: string | null
          item_name: string
          item_type: string
          movement_type: string
          notes: string | null
          organization_id: string
          quantity: number
          source: string
          supplier: string | null
          total_price: number | null
          unit: string
          unit_price: number | null
          work_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_note_id?: string | null
          delivery_note_number?: string | null
          id?: string
          inventory_item_id?: string | null
          is_immediate_consumption?: boolean
          item_category?: string | null
          item_name: string
          item_type: string
          movement_type: string
          notes?: string | null
          organization_id: string
          quantity: number
          source?: string
          supplier?: string | null
          total_price?: number | null
          unit?: string
          unit_price?: number | null
          work_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_note_id?: string | null
          delivery_note_number?: string | null
          id?: string
          inventory_item_id?: string | null
          is_immediate_consumption?: boolean
          item_category?: string | null
          item_name?: string
          item_type?: string
          movement_type?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          source?: string
          supplier?: string | null
          total_price?: number | null
          unit?: string
          unit_price?: number | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "pending_delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "work_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          message: string
          organization_id: string | null
          read: boolean
          to_user_id: string
          work_report_id: string | null
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          message: string
          organization_id?: string | null
          read?: boolean
          to_user_id: string
          work_report_id?: string | null
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string
          organization_id?: string | null
          read?: boolean
          to_user_id?: string
          work_report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json | null
          organization_id: string | null
          read: boolean
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          organization_id?: string | null
          read?: boolean
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          organization_id?: string | null
          read?: boolean
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          brand_color: string | null
          city: string | null
          commercial_name: string | null
          country: string | null
          created_at: string | null
          current_users: number | null
          email: string | null
          fiscal_id: string | null
          id: string
          invitation_code: string | null
          legal_name: string | null
          logo: string | null
          max_users: number | null
          name: string
          phone: string | null
          postal_code: string | null
          subscription_end_date: string | null
          subscription_status: string | null
          trial_end_date: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          city?: string | null
          commercial_name?: string | null
          country?: string | null
          created_at?: string | null
          current_users?: number | null
          email?: string | null
          fiscal_id?: string | null
          id?: string
          invitation_code?: string | null
          legal_name?: string | null
          logo?: string | null
          max_users?: number | null
          name: string
          phone?: string | null
          postal_code?: string | null
          subscription_end_date?: string | null
          subscription_status?: string | null
          trial_end_date?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          city?: string | null
          commercial_name?: string | null
          country?: string | null
          created_at?: string | null
          current_users?: number | null
          email?: string | null
          fiscal_id?: string | null
          id?: string
          invitation_code?: string | null
          legal_name?: string | null
          logo?: string | null
          max_users?: number | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          subscription_end_date?: string | null
          subscription_status?: string | null
          trial_end_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pending_delivery_notes: {
        Row: {
          ai_confidence: number | null
          created_at: string
          created_by: string | null
          delivery_date: string
          delivery_note_number: string | null
          id: string
          notes: string | null
          organization_id: string
          processed_items: Json
          raw_ocr_data: Json | null
          status: string
          supplier: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          work_id: string
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string
          delivery_note_number?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          processed_items?: Json
          raw_ocr_data?: Json | null
          status?: string
          supplier: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          work_id: string
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string
          delivery_note_number?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          processed_items?: Json
          raw_ocr_data?: Json | null
          status?: string
          supplier?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_delivery_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_delivery_notes_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          name: string
          organization_id: string
          progress: number
          responsible: string | null
          start_date: string
          status: string
          updated_at: string
          work_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          name: string
          organization_id: string
          progress?: number
          responsible?: string | null
          start_date: string
          status?: string
          updated_at?: string
          work_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          organization_id?: string
          progress?: number
          responsible?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phases_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean | null
          created_at: string | null
          department: string | null
          email: string | null
          full_name: string | null
          id: string
          last_login: string | null
          organization_id: string
          phone: string | null
          position: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string | null
          user_platform: string | null
        }
        Insert: {
          approved?: boolean | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_login?: string | null
          organization_id: string
          phone?: string | null
          position?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          user_platform?: string | null
        }
        Update: {
          approved?: boolean | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_login?: string | null
          organization_id?: string
          phone?: string | null
          position?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          user_platform?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_economic_reports: {
        Row: {
          created_at: string
          date: string
          foreman: string | null
          id: string
          machinery_groups: Json
          material_groups: Json
          organization_id: string | null
          rental_machinery_groups: Json
          saved_by: string
          site_manager: string | null
          subcontract_groups: Json
          total_amount: number
          work_groups: Json
          work_name: string
          work_number: string
          work_report_id: string
        }
        Insert: {
          created_at?: string
          date: string
          foreman?: string | null
          id?: string
          machinery_groups?: Json
          material_groups?: Json
          organization_id?: string | null
          rental_machinery_groups?: Json
          saved_by: string
          site_manager?: string | null
          subcontract_groups?: Json
          total_amount?: number
          work_groups?: Json
          work_name: string
          work_number: string
          work_report_id: string
        }
        Update: {
          created_at?: string
          date?: string
          foreman?: string | null
          id?: string
          machinery_groups?: Json
          material_groups?: Json
          organization_id?: string | null
          rental_machinery_groups?: Json
          saved_by?: string
          site_manager?: string | null
          subcontract_groups?: Json
          total_amount?: number
          work_groups?: Json
          work_name?: string
          work_number?: string
          work_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_economic_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_economic_reports_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_files: {
        Row: {
          created_at: string | null
          downloaded: boolean | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          from_user_id: string
          id: string
          message: string | null
          organization_id: string | null
          to_user_id: string
          work_report_id: string | null
        }
        Insert: {
          created_at?: string | null
          downloaded?: boolean | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          from_user_id: string
          id?: string
          message?: string | null
          organization_id?: string | null
          to_user_id: string
          work_report_id?: string | null
        }
        Update: {
          created_at?: string | null
          downloaded?: boolean | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          from_user_id?: string
          id?: string
          message?: string | null
          organization_id?: string | null
          to_user_id?: string
          work_report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_files_from_user_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_files_to_user_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_files_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_managers: {
        Row: {
          address: string | null
          authorization_number: string | null
          category: Database["public"]["Enums"]["waste_manager_category"]
          city: string | null
          company_name: string
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          fiscal_id: string | null
          id: string
          is_active: boolean
          nima_number: string | null
          notes: string | null
          organization_id: string
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          authorization_number?: string | null
          category: Database["public"]["Enums"]["waste_manager_category"]
          city?: string | null
          company_name: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          fiscal_id?: string | null
          id?: string
          is_active?: boolean
          nima_number?: string | null
          notes?: string | null
          organization_id: string
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          authorization_number?: string | null
          category?: Database["public"]["Enums"]["waste_manager_category"]
          city?: string | null
          company_name?: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          fiscal_id?: string | null
          id?: string
          is_active?: boolean
          nima_number?: string | null
          notes?: string | null
          organization_id?: string
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_managers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_hazardous: boolean
          is_system: boolean
          ler_code: string | null
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_hazardous?: boolean
          is_system?: boolean
          ler_code?: string | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_hazardous?: boolean
          is_system?: boolean
          ler_code?: string | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_assignments: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          organization_id: string | null
          user_id: string
          work_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id?: string | null
          user_id: string
          work_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id?: string | null
          user_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_assignments_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_inventory: {
        Row: {
          ai_confidence: number | null
          batch_number: string | null
          brand: string | null
          category: string | null
          condition: string | null
          created_at: string | null
          delivery_note_image: string | null
          delivery_note_number: string | null
          exit_date: string | null
          id: string
          is_immediate_consumption: boolean
          item_type: string
          last_entry_date: string | null
          last_movement_at: string | null
          last_supplier: string | null
          location: string | null
          model: string | null
          name: string
          notes: string | null
          observations: string | null
          organization_id: string | null
          product_code: string | null
          quantity: number | null
          serial_number: string | null
          source: string | null
          status: string | null
          total_price: number | null
          unit: string | null
          unit_norm: string | null
          unit_price: number | null
          updated_at: string | null
          work_id: string
        }
        Insert: {
          ai_confidence?: number | null
          batch_number?: string | null
          brand?: string | null
          category?: string | null
          condition?: string | null
          created_at?: string | null
          delivery_note_image?: string | null
          delivery_note_number?: string | null
          exit_date?: string | null
          id?: string
          is_immediate_consumption?: boolean
          item_type: string
          last_entry_date?: string | null
          last_movement_at?: string | null
          last_supplier?: string | null
          location?: string | null
          model?: string | null
          name: string
          notes?: string | null
          observations?: string | null
          organization_id?: string | null
          product_code?: string | null
          quantity?: number | null
          serial_number?: string | null
          source?: string | null
          status?: string | null
          total_price?: number | null
          unit?: string | null
          unit_norm?: string | null
          unit_price?: number | null
          updated_at?: string | null
          work_id: string
        }
        Update: {
          ai_confidence?: number | null
          batch_number?: string | null
          brand?: string | null
          category?: string | null
          condition?: string | null
          created_at?: string | null
          delivery_note_image?: string | null
          delivery_note_number?: string | null
          exit_date?: string | null
          id?: string
          is_immediate_consumption?: boolean
          item_type?: string
          last_entry_date?: string | null
          last_movement_at?: string | null
          last_supplier?: string | null
          location?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          observations?: string | null
          organization_id?: string | null
          product_code?: string | null
          quantity?: number | null
          serial_number?: string | null
          source?: string | null
          status?: string | null
          total_price?: number | null
          unit?: string | null
          unit_norm?: string | null
          unit_price?: number | null
          updated_at?: string | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_inventory_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_inventory_sync_log: {
        Row: {
          id: string
          organization_id: string | null
          synced_at: string
          work_id: string
          work_report_id: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          synced_at?: string
          work_id: string
          work_report_id: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          synced_at?: string
          work_id?: string
          work_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_inventory_sync_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_inventory_sync_log_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_inventory_sync_log_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      work_postventas: {
        Row: {
          actual_hours: number | null
          after_image: string | null
          assigned_company: string | null
          before_image: string | null
          code: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string
          estimated_hours: number | null
          id: string
          organization_id: string
          status: string
          subcontract_groups: Json | null
          updated_at: string
          work_id: string
        }
        Insert: {
          actual_hours?: number | null
          after_image?: string | null
          assigned_company?: string | null
          before_image?: string | null
          code: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          estimated_hours?: number | null
          id?: string
          organization_id: string
          status?: string
          subcontract_groups?: Json | null
          updated_at?: string
          work_id: string
        }
        Update: {
          actual_hours?: number | null
          after_image?: string | null
          assigned_company?: string | null
          before_image?: string | null
          code?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          estimated_hours?: number | null
          id?: string
          organization_id?: string
          status?: string
          subcontract_groups?: Json | null
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_postventas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_postventas_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_rental_machinery: {
        Row: {
          created_at: string
          created_by: string | null
          daily_rate: number | null
          delivery_date: string
          id: string
          image: string | null
          machine_number: string
          notes: string | null
          organization_id: string
          provider: string
          removal_date: string | null
          type: string
          updated_at: string
          work_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          delivery_date: string
          id?: string
          image?: string | null
          machine_number: string
          notes?: string | null
          organization_id: string
          provider: string
          removal_date?: string | null
          type: string
          updated_at?: string
          work_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          delivery_date?: string
          id?: string
          image?: string | null
          machine_number?: string
          notes?: string | null
          organization_id?: string
          provider?: string
          removal_date?: string | null
          type?: string
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_rental_machinery_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_rental_machinery_assignments: {
        Row: {
          activity: string | null
          assignment_date: string
          company_name: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          operator_name: string
          organization_id: string
          rental_machinery_id: string
          updated_at: string
          work_id: string
        }
        Insert: {
          activity?: string | null
          assignment_date: string
          company_name: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          operator_name: string
          organization_id: string
          rental_machinery_id: string
          updated_at?: string
          work_id: string
        }
        Update: {
          activity?: string | null
          assignment_date?: string
          company_name?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          operator_name?: string
          organization_id?: string
          rental_machinery_id?: string
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_rental_machinery_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_rental_machinery_assignments_rental_machinery_id_fkey"
            columns: ["rental_machinery_id"]
            isOneToOne: false
            referencedRelation: "work_rental_machinery"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_rental_machinery_assignments_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_repasos: {
        Row: {
          actual_hours: number | null
          after_image: string | null
          assigned_company: string | null
          before_image: string | null
          code: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string
          estimated_hours: number | null
          id: string
          organization_id: string
          status: string
          subcontract_groups: Json | null
          updated_at: string
          work_id: string
        }
        Insert: {
          actual_hours?: number | null
          after_image?: string | null
          assigned_company?: string | null
          before_image?: string | null
          code: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          estimated_hours?: number | null
          id?: string
          organization_id: string
          status?: string
          subcontract_groups?: Json | null
          updated_at?: string
          work_id: string
        }
        Update: {
          actual_hours?: number | null
          after_image?: string | null
          assigned_company?: string | null
          before_image?: string | null
          code?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          estimated_hours?: number | null
          id?: string
          organization_id?: string
          status?: string
          subcontract_groups?: Json | null
          updated_at?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_repasos_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_report_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          user_id: string
          work_report_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          user_id: string
          work_report_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          user_id?: string
          work_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_report_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_comments_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      work_report_downloads: {
        Row: {
          downloaded_at: string
          format: string
          id: string
          organization_id: string | null
          user_id: string
          work_report_id: string
        }
        Insert: {
          downloaded_at?: string
          format: string
          id?: string
          organization_id?: string | null
          user_id: string
          work_report_id: string
        }
        Update: {
          downloaded_at?: string
          format?: string
          id?: string
          organization_id?: string | null
          user_id?: string
          work_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_report_downloads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_downloads_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      work_report_images: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          id: string
          image_url: string
          updated_at: string
          work_report_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url: string
          updated_at?: string
          work_report_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string
          updated_at?: string
          work_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_report_images_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      work_report_waste_entries: {
        Row: {
          action_type: Database["public"]["Enums"]["waste_action_type"]
          container_id: string | null
          container_size: Database["public"]["Enums"]["container_size"] | null
          created_at: string
          created_by: string | null
          destination_plant: string | null
          id: string
          linked_entry_id: string | null
          manager_id: string | null
          manager_name: string | null
          new_container_id: string | null
          notes: string | null
          operation_mode: Database["public"]["Enums"]["waste_operation_mode"]
          operator_name: string | null
          organization_id: string
          ticket_number: string | null
          ticket_photo_url: string | null
          updated_at: string
          vehicle_plate: string | null
          vehicle_type: string | null
          volume_m3: number | null
          waste_type_id: string | null
          weight_tn: number | null
          work_id: string | null
          work_report_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["waste_action_type"]
          container_id?: string | null
          container_size?: Database["public"]["Enums"]["container_size"] | null
          created_at?: string
          created_by?: string | null
          destination_plant?: string | null
          id?: string
          linked_entry_id?: string | null
          manager_id?: string | null
          manager_name?: string | null
          new_container_id?: string | null
          notes?: string | null
          operation_mode: Database["public"]["Enums"]["waste_operation_mode"]
          operator_name?: string | null
          organization_id: string
          ticket_number?: string | null
          ticket_photo_url?: string | null
          updated_at?: string
          vehicle_plate?: string | null
          vehicle_type?: string | null
          volume_m3?: number | null
          waste_type_id?: string | null
          weight_tn?: number | null
          work_id?: string | null
          work_report_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["waste_action_type"]
          container_id?: string | null
          container_size?: Database["public"]["Enums"]["container_size"] | null
          created_at?: string
          created_by?: string | null
          destination_plant?: string | null
          id?: string
          linked_entry_id?: string | null
          manager_id?: string | null
          manager_name?: string | null
          new_container_id?: string | null
          notes?: string | null
          operation_mode?: Database["public"]["Enums"]["waste_operation_mode"]
          operator_name?: string | null
          organization_id?: string
          ticket_number?: string | null
          ticket_photo_url?: string | null
          updated_at?: string
          vehicle_plate?: string | null
          vehicle_type?: string | null
          volume_m3?: number | null
          waste_type_id?: string | null
          weight_tn?: number | null
          work_id?: string | null
          work_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_report_waste_entries_linked_entry_id_fkey"
            columns: ["linked_entry_id"]
            isOneToOne: false
            referencedRelation: "work_report_waste_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_waste_entries_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "waste_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_waste_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_waste_entries_waste_type_id_fkey"
            columns: ["waste_type_id"]
            isOneToOne: false
            referencedRelation: "waste_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_waste_entries_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_waste_entries_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      work_reports: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          auto_clone_next_day: boolean
          completed_sections: Json | null
          created_at: string | null
          created_by: string | null
          date: string
          foreman: string | null
          foreman_entries: Json | null
          foreman_hours: number | null
          foreman_signature: string | null
          id: string
          is_archived: boolean
          last_edited_at: string | null
          last_edited_by: string | null
          machinery_groups: Json | null
          material_groups: Json | null
          missing_delivery_notes: boolean
          observations: string | null
          organization_id: string
          rental_machinery_groups: Json | null
          site_manager: string | null
          site_manager_signature: string | null
          status: string | null
          subcontract_groups: Json | null
          updated_at: string | null
          waste_log: Json | null
          work_groups: Json | null
          work_id: string | null
          work_name: string
          work_number: string
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          auto_clone_next_day?: boolean
          completed_sections?: Json | null
          created_at?: string | null
          created_by?: string | null
          date: string
          foreman?: string | null
          foreman_entries?: Json | null
          foreman_hours?: number | null
          foreman_signature?: string | null
          id?: string
          is_archived?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          machinery_groups?: Json | null
          material_groups?: Json | null
          missing_delivery_notes?: boolean
          observations?: string | null
          organization_id: string
          rental_machinery_groups?: Json | null
          site_manager?: string | null
          site_manager_signature?: string | null
          status?: string | null
          subcontract_groups?: Json | null
          updated_at?: string | null
          waste_log?: Json | null
          work_groups?: Json | null
          work_id?: string | null
          work_name: string
          work_number: string
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          auto_clone_next_day?: boolean
          completed_sections?: Json | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          foreman?: string | null
          foreman_entries?: Json | null
          foreman_hours?: number | null
          foreman_signature?: string | null
          id?: string
          is_archived?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          machinery_groups?: Json | null
          material_groups?: Json | null
          missing_delivery_notes?: boolean
          observations?: string | null
          organization_id?: string
          rental_machinery_groups?: Json | null
          site_manager?: string | null
          site_manager_signature?: string | null
          status?: string | null
          subcontract_groups?: Json | null
          updated_at?: string | null
          waste_log?: Json | null
          work_groups?: Json | null
          work_id?: string | null
          work_name?: string
          work_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_reports_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      works: {
        Row: {
          address: string | null
          budget: number | null
          city: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          execution_period: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          number: string
          organization_id: string | null
          promoter: string | null
          province: string | null
          start_date: string | null
          street_address: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          budget?: number | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          execution_period?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          number: string
          organization_id?: string | null
          promoter?: string | null
          province?: string | null
          start_date?: string | null
          street_address?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          budget?: number | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          execution_period?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          number?: string
          organization_id?: string | null
          promoter?: string | null
          province?: string | null
          start_date?: string | null
          street_address?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "works_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_containers: {
        Row: {
          container_id: string | null
          container_size: Database["public"]["Enums"]["container_size"] | null
          delivery_date: string | null
          manager_id: string | null
          manager_name: string | null
          organization_id: string | null
          waste_type_id: string | null
          waste_type_name: string | null
          work_id: string | null
          work_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_report_waste_entries_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "waste_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_waste_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_waste_entries_waste_type_id_fkey"
            columns: ["waste_type_id"]
            isOneToOne: false
            referencedRelation: "waste_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_waste_entries_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_view_profile: { Args: { _profile_id: string }; Returns: boolean }
      clean_user_metadata: { Args: never; Returns: undefined }
      clean_user_sessions: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      complete_user_data_reset: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      current_user_organization: { Args: never; Returns: string }
      deep_clean_user_auth: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      delete_duplicate_work_reports: {
        Args: never
        Returns: {
          deleted_count: number
          message: string
        }[]
      }
      delete_user_and_data: {
        Args: { user_id_to_delete: string }
        Returns: undefined
      }
      fill_missing_foreman_names: {
        Args: never
        Returns: {
          message: string
          updated_count: number
        }[]
      }
      fill_missing_site_manager_names: {
        Args: never
        Returns: {
          message: string
          updated_count: number
        }[]
      }
      fix_user_utf8_metadata: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      get_accessible_work_reports: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          auto_clone_next_day: boolean
          completed_sections: Json | null
          created_at: string | null
          created_by: string | null
          date: string
          foreman: string | null
          foreman_entries: Json | null
          foreman_hours: number | null
          foreman_signature: string | null
          id: string
          is_archived: boolean
          last_edited_at: string | null
          last_edited_by: string | null
          machinery_groups: Json | null
          material_groups: Json | null
          missing_delivery_notes: boolean
          observations: string | null
          organization_id: string
          rental_machinery_groups: Json | null
          site_manager: string | null
          site_manager_signature: string | null
          status: string | null
          subcontract_groups: Json | null
          updated_at: string | null
          waste_log: Json | null
          work_groups: Json | null
          work_id: string | null
          work_name: string
          work_number: string
        }[]
        SetofOptions: {
          from: "*"
          to: "work_reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_assignable_users_for_site_manager: {
        Args: { org_id: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_company_portfolio_with_names: {
        Args: never
        Returns: {
          address: string
          city: string
          company_name: string
          company_type: string[]
          contact_email: string
          contact_person: string
          contact_phone: string
          country: string
          created_at: string
          created_by: string
          creator_name: string
          editor_name: string
          fiscal_id: string
          id: string
          notes: string
          organization_id: string
          postal_code: string
          updated_at: string
          updated_by: string
        }[]
      }
      get_messageable_users: {
        Args: never
        Returns: {
          approved: boolean
          full_name: string
          id: string
          roles: Database["public"]["Enums"]["app_role"][]
        }[]
      }
      get_organization_admin: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_work_access: {
        Args: { _user_id: string; _work_id: string }
        Returns: boolean
      }
      is_assigned_to_work: {
        Args: { _user_id: string; _work_id: string }
        Returns: boolean
      }
      same_organization: { Args: { target_user_id: string }; Returns: boolean }
      trigger_auto_duplicate_rental_machinery: {
        Args: never
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "foreman"
        | "site_manager"
        | "reader"
        | "master"
        | "ofi"
      container_size: "3m3" | "6m3" | "12m3" | "30m3"
      waste_action_type: "delivery" | "withdrawal" | "exchange" | "load"
      waste_manager_category:
        | "transporter"
        | "landfill"
        | "container_rental"
        | "recycler"
      waste_operation_mode: "container_management" | "direct_transport"
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
      app_role: ["admin", "foreman", "site_manager", "reader", "master", "ofi"],
      container_size: ["3m3", "6m3", "12m3", "30m3"],
      waste_action_type: ["delivery", "withdrawal", "exchange", "load"],
      waste_manager_category: [
        "transporter",
        "landfill",
        "container_rental",
        "recycler",
      ],
      waste_operation_mode: ["container_management", "direct_transport"],
    },
  },
} as const
