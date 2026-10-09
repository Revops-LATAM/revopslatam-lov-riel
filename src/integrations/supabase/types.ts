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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_access: {
        Row: {
          account_id: string
          granted_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          granted_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          granted_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_billing_entities: {
        Row: {
          account_id: string
          activo: boolean
          cc_emails: string[]
          comuna: string | null
          created_at: string
          direccion: string | null
          email_facturacion: string | null
          giro: string | null
          id: string
          is_primary: boolean
          orden: number
          razon_social: string
          rut: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          activo?: boolean
          cc_emails?: string[]
          comuna?: string | null
          created_at?: string
          direccion?: string | null
          email_facturacion?: string | null
          giro?: string | null
          id?: string
          is_primary?: boolean
          orden?: number
          razon_social: string
          rut?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          activo?: boolean
          cc_emails?: string[]
          comuna?: string | null
          created_at?: string
          direccion?: string | null
          email_facturacion?: string | null
          giro?: string | null
          id?: string
          is_primary?: boolean
          orden?: number
          razon_social?: string
          rut?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_billing_entities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          access_mode: string
          address: string | null
          billing_email: string | null
          business_activity: string | null
          commune: string | null
          created_at: string
          created_by: string
          id: string
          legal_name: string | null
          name: string
          notes: string | null
          owner_id: string | null
          partner_id: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          secondary_contacts: Json
          slug: string
          status: Database["public"]["Enums"]["account_status"]
          tax_id: string | null
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          access_mode?: string
          address?: string | null
          billing_email?: string | null
          business_activity?: string | null
          commune?: string | null
          created_at?: string
          created_by: string
          id?: string
          legal_name?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          partner_id?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          secondary_contacts?: Json
          slug: string
          status?: Database["public"]["Enums"]["account_status"]
          tax_id?: string | null
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          access_mode?: string
          address?: string | null
          billing_email?: string | null
          business_activity?: string | null
          commune?: string | null
          created_at?: string
          created_by?: string
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          partner_id?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          secondary_contacts?: Json
          slug?: string
          status?: Database["public"]["Enums"]["account_status"]
          tax_id?: string | null
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_comment_map: {
        Row: {
          asana_story_gid: string
          asana_task_gid: string
          comment_id: string
          created_at: string
          id: string
          source: string
          workspace_id: string
        }
        Insert: {
          asana_story_gid: string
          asana_task_gid: string
          comment_id: string
          created_at?: string
          id?: string
          source: string
          workspace_id: string
        }
        Update: {
          asana_story_gid?: string
          asana_task_gid?: string
          comment_id?: string
          created_at?: string
          id?: string
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_comment_map_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asana_comment_map_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_connections: {
        Row: {
          asana_workspace_gid: string
          asana_workspace_name: string | null
          connected_at: string
          connected_by: string | null
          default_team_gid: string | null
          id: string
          last_error: string | null
          status: string
          updated_at: string
          webhook_secret: string | null
          workspace_id: string
        }
        Insert: {
          asana_workspace_gid: string
          asana_workspace_name?: string | null
          connected_at?: string
          connected_by?: string | null
          default_team_gid?: string | null
          id?: string
          last_error?: string | null
          status?: string
          updated_at?: string
          webhook_secret?: string | null
          workspace_id: string
        }
        Update: {
          asana_workspace_gid?: string
          asana_workspace_name?: string | null
          connected_at?: string
          connected_by?: string | null
          default_team_gid?: string | null
          id?: string
          last_error?: string | null
          status?: string
          updated_at?: string
          webhook_secret?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_project_links: {
        Row: {
          asana_project_gid: string
          asana_webhook_gid: string | null
          asana_workspace_gid: string
          created_at: string
          id: string
          initial_import_completed_at: string | null
          last_error: string | null
          last_sync_at: string | null
          project_id: string
          sync_status: Database["public"]["Enums"]["asana_sync_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asana_project_gid: string
          asana_webhook_gid?: string | null
          asana_workspace_gid: string
          created_at?: string
          id?: string
          initial_import_completed_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          project_id: string
          sync_status?: Database["public"]["Enums"]["asana_sync_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asana_project_gid?: string
          asana_webhook_gid?: string | null
          asana_workspace_gid?: string
          created_at?: string
          id?: string
          initial_import_completed_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          project_id?: string
          sync_status?: Database["public"]["Enums"]["asana_sync_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asana_project_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_project_sync_config: {
        Row: {
          asana_status_field_gid: string | null
          comments_enabled: boolean
          created_at: string
          last_webhook_at: string | null
          project_id: string
          pull_enabled: boolean
          push_enabled: boolean
          status_mode: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asana_status_field_gid?: string | null
          comments_enabled?: boolean
          created_at?: string
          last_webhook_at?: string | null
          project_id: string
          pull_enabled?: boolean
          push_enabled?: boolean
          status_mode?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asana_status_field_gid?: string | null
          comments_enabled?: boolean
          created_at?: string
          last_webhook_at?: string | null
          project_id?: string
          pull_enabled?: boolean
          push_enabled?: boolean
          status_mode?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_project_sync_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asana_project_sync_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_status_map: {
        Row: {
          asana_project_gid: string
          asana_value: string
          asana_value_label: string | null
          created_at: string
          id: string
          kind: string
          status_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asana_project_gid: string
          asana_value: string
          asana_value_label?: string | null
          created_at?: string
          id?: string
          kind?: string
          status_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asana_project_gid?: string
          asana_value?: string
          asana_value_label?: string | null
          created_at?: string
          id?: string
          kind?: string
          status_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_status_map_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asana_status_map_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_sync_queue: {
        Row: {
          asana_gid: string | null
          attempts: number
          created_at: string
          direction: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          resource_kind: string
          riel_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asana_gid?: string | null
          attempts?: number
          created_at?: string
          direction: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          resource_kind: string
          riel_id?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asana_gid?: string | null
          attempts?: number
          created_at?: string
          direction?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          resource_kind?: string
          riel_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_sync_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_task_map: {
        Row: {
          asana_modified_at: string | null
          asana_project_gid: string
          asana_task_gid: string
          created_at: string
          id: string
          last_source: string
          last_synced_at: string | null
          last_synced_hash: string | null
          task_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asana_modified_at?: string | null
          asana_project_gid: string
          asana_task_gid: string
          created_at?: string
          id?: string
          last_source?: string
          last_synced_at?: string | null
          last_synced_hash?: string | null
          task_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asana_modified_at?: string | null
          asana_project_gid?: string
          asana_task_gid?: string
          created_at?: string
          id?: string
          last_source?: string
          last_synced_at?: string | null
          last_synced_hash?: string | null
          task_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_task_map_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "asana_task_map_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asana_task_map_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_user_map: {
        Row: {
          asana_user_email: string | null
          asana_user_gid: string
          asana_user_name: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          asana_user_email?: string | null
          asana_user_gid: string
          asana_user_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          asana_user_email?: string | null
          asana_user_gid?: string
          asana_user_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_user_map_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_webhook_subscriptions: {
        Row: {
          active: boolean
          asana_resource_gid: string
          asana_webhook_gid: string | null
          created_at: string
          id: string
          last_event_at: string | null
          project_id: string
          secret: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          asana_resource_gid: string
          asana_webhook_gid?: string | null
          created_at?: string
          id?: string
          last_event_at?: string | null
          project_id: string
          secret?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          asana_resource_gid?: string
          asana_webhook_gid?: string | null
          created_at?: string
          id?: string
          last_event_at?: string | null
          project_id?: string
          secret?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_webhook_subscriptions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asana_webhook_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_template_slots: {
        Row: {
          channels: Database["public"]["Enums"]["piece_channel"][]
          created_at: string
          format: Database["public"]["Enums"]["piece_format"]
          id: string
          pillar_id: string | null
          sort_order: number
          template_id: string
          time_of_day: string | null
          weekday: number
        }
        Insert: {
          channels?: Database["public"]["Enums"]["piece_channel"][]
          created_at?: string
          format: Database["public"]["Enums"]["piece_format"]
          id?: string
          pillar_id?: string | null
          sort_order?: number
          template_id: string
          time_of_day?: string | null
          weekday: number
        }
        Update: {
          channels?: Database["public"]["Enums"]["piece_channel"][]
          created_at?: string
          format?: Database["public"]["Enums"]["piece_format"]
          id?: string
          pillar_id?: string | null
          sort_order?: number
          template_id?: string
          time_of_day?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "cadence_template_slots_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "content_pillars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_template_slots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cadence_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_assignees: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_assignees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          attendees_count: number
          classified_at: string | null
          classified_by: string | null
          connection_id: string
          created_at: string
          end_at: string
          google_event_id: string
          google_ical_uid: string | null
          google_recurring_event_id: string | null
          google_status: string | null
          html_link: string | null
          id: string
          inbox_status: Database["public"]["Enums"]["calendar_event_inbox_status"]
          is_all_day: boolean
          is_ooo: boolean
          is_private: boolean
          organizer_email: string | null
          phase_id: string | null
          project_id: string | null
          sprint_id: string | null
          start_at: string
          task_id: string | null
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          attendees_count?: number
          classified_at?: string | null
          classified_by?: string | null
          connection_id: string
          created_at?: string
          end_at: string
          google_event_id: string
          google_ical_uid?: string | null
          google_recurring_event_id?: string | null
          google_status?: string | null
          html_link?: string | null
          id?: string
          inbox_status?: Database["public"]["Enums"]["calendar_event_inbox_status"]
          is_all_day?: boolean
          is_ooo?: boolean
          is_private?: boolean
          organizer_email?: string | null
          phase_id?: string | null
          project_id?: string | null
          sprint_id?: string | null
          start_at: string
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          attendees_count?: number
          classified_at?: string | null
          classified_by?: string | null
          connection_id?: string
          created_at?: string
          end_at?: string
          google_event_id?: string
          google_ical_uid?: string | null
          google_recurring_event_id?: string | null
          google_status?: string | null
          html_link?: string | null
          id?: string
          inbox_status?: Database["public"]["Enums"]["calendar_event_inbox_status"]
          is_all_day?: boolean
          is_ooo?: boolean
          is_private?: boolean
          organizer_email?: string | null
          phase_id?: string | null
          project_id?: string | null
          sprint_id?: string | null
          start_at?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "user_calendar_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_recurring_classifications: {
        Row: {
          classified_by: string | null
          connection_id: string
          created_at: string
          google_recurring_event_id: string
          id: string
          inbox_status: Database["public"]["Enums"]["calendar_event_inbox_status"]
          phase_id: string | null
          project_id: string | null
          shared_task_id: string | null
          sprint_id: string | null
          task_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          classified_by?: string | null
          connection_id: string
          created_at?: string
          google_recurring_event_id: string
          id?: string
          inbox_status?: Database["public"]["Enums"]["calendar_event_inbox_status"]
          phase_id?: string | null
          project_id?: string | null
          shared_task_id?: string | null
          sprint_id?: string | null
          task_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          classified_by?: string | null
          connection_id?: string
          created_at?: string
          google_recurring_event_id?: string
          id?: string
          inbox_status?: Database["public"]["Enums"]["calendar_event_inbox_status"]
          phase_id?: string | null
          project_id?: string | null
          shared_task_id?: string | null
          sprint_id?: string | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_recurring_classifications_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "user_calendar_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_recurring_classifications_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_recurring_classifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_recurring_classifications_shared_task_id_fkey"
            columns: ["shared_task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "calendar_recurring_classifications_shared_task_id_fkey"
            columns: ["shared_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_recurring_classifications_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_recurring_classifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "calendar_recurring_classifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_recurring_classifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_templates: {
        Row: {
          created_at: string
          default_channels: string[]
          default_duration_days: number
          default_status: Database["public"]["Enums"]["campaign_status"]
          description: string | null
          id: string
          is_system: boolean
          name: string
          pieces_json: Json
          sort_order: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          default_channels?: string[]
          default_duration_days?: number
          default_status?: Database["public"]["Enums"]["campaign_status"]
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          pieces_json?: Json
          sort_order?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          default_channels?: string[]
          default_duration_days?: number
          default_status?: Database["public"]["Enums"]["campaign_status"]
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          pieces_json?: Json
          sort_order?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          archived: boolean
          brief_md: string | null
          budget: number | null
          channels: string[]
          color: string
          created_at: string
          created_by: string
          currency: string
          end_date: string | null
          hubspot_campaign_id: string | null
          hubspot_last_sync_at: string | null
          id: string
          kpi_actual: number | null
          kpi_label: string | null
          kpi_target: number | null
          launch_date: string | null
          name: string
          objective: string | null
          owner_id: string | null
          slug: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          brief_md?: string | null
          budget?: number | null
          channels?: string[]
          color?: string
          created_at?: string
          created_by: string
          currency?: string
          end_date?: string | null
          hubspot_campaign_id?: string | null
          hubspot_last_sync_at?: string | null
          id?: string
          kpi_actual?: number | null
          kpi_label?: string | null
          kpi_target?: number | null
          launch_date?: string | null
          name: string
          objective?: string | null
          owner_id?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived?: boolean
          brief_md?: string | null
          budget?: number | null
          channels?: string[]
          color?: string
          created_at?: string
          created_by?: string
          currency?: string
          end_date?: string | null
          hubspot_campaign_id?: string | null
          hubspot_last_sync_at?: string | null
          id?: string
          kpi_actual?: number | null
          kpi_label?: string | null
          kpi_target?: number | null
          launch_date?: string | null
          name?: string
          objective?: string | null
          owner_id?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          form_id: string
          id: string
          kind: string
          last_seen_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          form_id: string
          id?: string
          kind: string
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          form_id?: string
          id?: string
          kind?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_tokens_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "client_ticket_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ticket_authorized_emails: {
        Row: {
          created_at: string
          email: string
          form_id: string
          id: string
          portal_role: string
        }
        Insert: {
          created_at?: string
          email: string
          form_id: string
          id?: string
          portal_role?: string
        }
        Update: {
          created_at?: string
          email?: string
          form_id?: string
          id?: string
          portal_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ticket_authorized_emails_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "client_ticket_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ticket_forms: {
        Row: {
          active: boolean
          created_at: string
          form_schema: Json
          id: string
          project_id: string
          slack_channel_id: string | null
          slack_channel_name: string | null
          slug: string
          tickets_phase_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          form_schema?: Json
          id?: string
          project_id: string
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slug: string
          tickets_phase_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          form_schema?: Json
          id?: string
          project_id?: string
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slug?: string
          tickets_phase_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ticket_forms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ticket_forms_tickets_phase_id_fkey"
            columns: ["tickets_phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ticket_forms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ticket_submissions: {
        Row: {
          created_at: string
          form_id: string
          id: string
          ip: string | null
          payload: Json
          submitter_email: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          ip?: string | null
          payload: Json
          submitter_email: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          ip?: string | null
          payload?: Json
          submitter_email?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_ticket_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "client_ticket_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ticket_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "client_ticket_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          base_amount: number
          comision_padre_id: string | null
          contract_id: string
          created_at: string
          currency: string
          estado: Database["public"]["Enums"]["commission_status"]
          fecha_generacion: string
          fecha_pago: string | null
          id: string
          notas: string | null
          porcentaje: number
          updated_at: string
          vendedor_id: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          base_amount?: number
          comision_padre_id?: string | null
          contract_id: string
          created_at?: string
          currency?: string
          estado?: Database["public"]["Enums"]["commission_status"]
          fecha_generacion?: string
          fecha_pago?: string | null
          id?: string
          notas?: string | null
          porcentaje?: number
          updated_at?: string
          vendedor_id: string
          workspace_id: string
        }
        Update: {
          amount?: number
          base_amount?: number
          comision_padre_id?: string | null
          contract_id?: string
          created_at?: string
          currency?: string
          estado?: Database["public"]["Enums"]["commission_status"]
          fecha_generacion?: string
          fecha_pago?: string | null
          id?: string
          notas?: string | null
          porcentaje?: number
          updated_at?: string
          vendedor_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_comision_padre_id_fkey"
            columns: ["comision_padre_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_grids: {
        Row: {
          created_at: string
          generated_at: string | null
          generated_by: string | null
          id: string
          month: number
          notes: string | null
          template_id: string | null
          updated_at: string
          workspace_id: string
          year: number
        }
        Insert: {
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          month: number
          notes?: string | null
          template_id?: string | null
          updated_at?: string
          workspace_id: string
          year: number
        }
        Update: {
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          month?: number
          notes?: string | null
          template_id?: string | null
          updated_at?: string
          workspace_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_grids_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cadence_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_grids_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pieces: {
        Row: {
          body_md: string | null
          campaign_id: string | null
          channel: string
          color: string | null
          created_at: string
          created_by: string
          format: string | null
          id: string
          owner_id: string | null
          publish_at: string | null
          status_editorial: Database["public"]["Enums"]["content_piece_status"]
          title: string
          updated_at: string
          url_published: string | null
          workspace_id: string
        }
        Insert: {
          body_md?: string | null
          campaign_id?: string | null
          channel: string
          color?: string | null
          created_at?: string
          created_by: string
          format?: string | null
          id?: string
          owner_id?: string | null
          publish_at?: string | null
          status_editorial?: Database["public"]["Enums"]["content_piece_status"]
          title: string
          updated_at?: string
          url_published?: string | null
          workspace_id: string
        }
        Update: {
          body_md?: string | null
          campaign_id?: string | null
          channel?: string
          color?: string | null
          created_at?: string
          created_by?: string
          format?: string | null
          id?: string
          owner_id?: string | null
          publish_at?: string | null
          status_editorial?: Database["public"]["Enums"]["content_piece_status"]
          title?: string
          updated_at?: string
          url_published?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_pieces_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pieces_v2: {
        Row: {
          asset_url: string | null
          campaign_id: string | null
          channel_assets: Json
          channels: Database["public"]["Enums"]["piece_channel"][]
          content: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          format: Database["public"]["Enums"]["piece_format"]
          grid_id: string | null
          hubspot_broadcast_ids: Json
          hubspot_last_error: string | null
          hubspot_synced_at: string | null
          id: string
          owner_id: string | null
          pillar_id: string | null
          publish_at: string | null
          status: Database["public"]["Enums"]["piece_status_v2"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asset_url?: string | null
          campaign_id?: string | null
          channel_assets?: Json
          channels?: Database["public"]["Enums"]["piece_channel"][]
          content?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          format?: Database["public"]["Enums"]["piece_format"]
          grid_id?: string | null
          hubspot_broadcast_ids?: Json
          hubspot_last_error?: string | null
          hubspot_synced_at?: string | null
          id?: string
          owner_id?: string | null
          pillar_id?: string | null
          publish_at?: string | null
          status?: Database["public"]["Enums"]["piece_status_v2"]
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asset_url?: string | null
          campaign_id?: string | null
          channel_assets?: Json
          channels?: Database["public"]["Enums"]["piece_channel"][]
          content?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          format?: Database["public"]["Enums"]["piece_format"]
          grid_id?: string | null
          hubspot_broadcast_ids?: Json
          hubspot_last_error?: string | null
          hubspot_synced_at?: string | null
          id?: string
          owner_id?: string | null
          pillar_id?: string | null
          publish_at?: string | null
          status?: Database["public"]["Enums"]["piece_status_v2"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_pieces_v2_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_v2_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "content_grids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_v2_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "content_pillars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_v2_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pillars: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_pillars_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_billing_splits: {
        Row: {
          billing_entity_id: string
          contract_id: string
          created_at: string
          id: string
          monto: number
          orden: number
        }
        Insert: {
          billing_entity_id: string
          contract_id: string
          created_at?: string
          id?: string
          monto?: number
          orden?: number
        }
        Update: {
          billing_entity_id?: string
          contract_id?: string
          created_at?: string
          id?: string
          monto?: number
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_billing_splits_billing_entity_id_fkey"
            columns: ["billing_entity_id"]
            isOneToOne: false
            referencedRelation: "account_billing_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_billing_splits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_financials: {
        Row: {
          contract_id: string
          contracted_hours_total: number | null
          created_at: string
          fee_total: number | null
          hourly_rate: number | null
          internal_hourly_cost: number | null
          monthly_fee: number | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          contract_id: string
          contracted_hours_total?: number | null
          created_at?: string
          fee_total?: number | null
          hourly_rate?: number | null
          internal_hourly_cost?: number | null
          monthly_fee?: number | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string
          contracted_hours_total?: number | null
          created_at?: string
          fee_total?: number | null
          hourly_rate?: number | null
          internal_hourly_cost?: number | null
          monthly_fee?: number | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_financials_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_handoffs: {
        Row: {
          alerta_margen: boolean
          asignado_a: string | null
          completado_at: string | null
          contract_id: string
          created_at: string
          id: string
          margen_estimado_pct: number | null
          notas: string | null
          state: Database["public"]["Enums"]["handoff_state"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          alerta_margen?: boolean
          asignado_a?: string | null
          completado_at?: string | null
          contract_id: string
          created_at?: string
          id?: string
          margen_estimado_pct?: number | null
          notas?: string | null
          state?: Database["public"]["Enums"]["handoff_state"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          alerta_margen?: boolean
          asignado_a?: string | null
          completado_at?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          margen_estimado_pct?: number | null
          notas?: string | null
          state?: Database["public"]["Enums"]["handoff_state"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_handoffs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_handoffs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payments: {
        Row: {
          amount: number
          billing_entity_id: string | null
          contract_id: string
          created_at: string
          currency: string
          due_date: string
          id: string
          invoice_id: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          milestone_id: string | null
          notes: string | null
          paid_at: string | null
          period_label: string | null
          ready_to_invoice: boolean
          service_line_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_entity_id?: string | null
          contract_id: string
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          invoice_id?: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          milestone_id?: string | null
          notes?: string | null
          paid_at?: string | null
          period_label?: string | null
          ready_to_invoice?: boolean
          service_line_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_entity_id?: string | null
          contract_id?: string
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          invoice_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          milestone_id?: string | null
          notes?: string | null
          paid_at?: string | null
          period_label?: string | null
          ready_to_invoice?: boolean
          service_line_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_billing_entity_id_fkey"
            columns: ["billing_entity_id"]
            isOneToOne: false
            referencedRelation: "account_billing_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "contract_service_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_service_lines: {
        Row: {
          contract_id: string
          created_at: string
          descripcion: string | null
          es_bono: boolean
          fecha_primer_pago: string | null
          frecuencia: Database["public"]["Enums"]["service_frequency"]
          id: string
          moneda: string
          monto: number | null
          numero_cuotas: number | null
          orden: number
          service_type_id: string | null
          tipo_servicio: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          descripcion?: string | null
          es_bono?: boolean
          fecha_primer_pago?: string | null
          frecuencia: Database["public"]["Enums"]["service_frequency"]
          id?: string
          moneda?: string
          monto?: number | null
          numero_cuotas?: number | null
          orden?: number
          service_type_id?: string | null
          tipo_servicio: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          descripcion?: string | null
          es_bono?: boolean
          fecha_primer_pago?: string | null
          frecuencia?: Database["public"]["Enums"]["service_frequency"]
          id?: string
          moneda?: string
          monto?: number | null
          numero_cuotas?: number | null
          orden?: number
          service_type_id?: string | null
          tipo_servicio?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_service_lines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_service_lines_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_service_milestones: {
        Row: {
          created_at: string
          descripcion: string | null
          fecha_estimada: string | null
          id: string
          moneda: string
          monto: number | null
          nombre: string
          numero_hito: number
          orden: number
          service_line_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fecha_estimada?: string | null
          id?: string
          moneda?: string
          monto?: number | null
          nombre: string
          numero_hito: number
          orden?: number
          service_line_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fecha_estimada?: string | null
          id?: string
          moneda?: string
          monto?: number | null
          nombre?: string
          numero_hito?: number
          orden?: number
          service_line_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_service_milestones_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "contract_service_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          account_id: string
          anticipacion_renovacion_dias: number | null
          billing_model: Database["public"]["Enums"]["contract_billing_model"]
          code: string | null
          comision_pct: number
          contrato_padre_id: string | null
          created_at: string
          created_by: string
          currency: string
          descripcion_factura: string | null
          dia_facturacion: number | null
          duracion_tipo: string
          end_date: string | null
          fecha_aviso_renovacion: string | null
          fecha_cancelacion: string | null
          fecha_primera_facturacion: string | null
          hours_per_sprint: number | null
          id: string
          is_partner: boolean
          legacy_milestone_billing: boolean
          modo: Database["public"]["Enums"]["contract_mode"]
          motivo_cancelacion: string | null
          name: string
          notas_comerciales: string | null
          notes: string | null
          observaciones: string | null
          owner_consultant_id: string | null
          payment_schedule_config: Json
          payment_schedule_type: Database["public"]["Enums"]["payment_schedule_type"]
          puede_renovarse: boolean
          requires_client_tickets: boolean
          sla_id: string | null
          sprint_cadence: Database["public"]["Enums"]["sprint_cadence"] | null
          sprint_duration_days: number | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          type: Database["public"]["Enums"]["contract_type"]
          updated_at: string
          vendedor_id: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          anticipacion_renovacion_dias?: number | null
          billing_model?: Database["public"]["Enums"]["contract_billing_model"]
          code?: string | null
          comision_pct?: number
          contrato_padre_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          descripcion_factura?: string | null
          dia_facturacion?: number | null
          duracion_tipo?: string
          end_date?: string | null
          fecha_aviso_renovacion?: string | null
          fecha_cancelacion?: string | null
          fecha_primera_facturacion?: string | null
          hours_per_sprint?: number | null
          id?: string
          is_partner?: boolean
          legacy_milestone_billing?: boolean
          modo?: Database["public"]["Enums"]["contract_mode"]
          motivo_cancelacion?: string | null
          name: string
          notas_comerciales?: string | null
          notes?: string | null
          observaciones?: string | null
          owner_consultant_id?: string | null
          payment_schedule_config?: Json
          payment_schedule_type?: Database["public"]["Enums"]["payment_schedule_type"]
          puede_renovarse?: boolean
          requires_client_tickets?: boolean
          sla_id?: string | null
          sprint_cadence?: Database["public"]["Enums"]["sprint_cadence"] | null
          sprint_duration_days?: number | null
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          type: Database["public"]["Enums"]["contract_type"]
          updated_at?: string
          vendedor_id?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          anticipacion_renovacion_dias?: number | null
          billing_model?: Database["public"]["Enums"]["contract_billing_model"]
          code?: string | null
          comision_pct?: number
          contrato_padre_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          descripcion_factura?: string | null
          dia_facturacion?: number | null
          duracion_tipo?: string
          end_date?: string | null
          fecha_aviso_renovacion?: string | null
          fecha_cancelacion?: string | null
          fecha_primera_facturacion?: string | null
          hours_per_sprint?: number | null
          id?: string
          is_partner?: boolean
          legacy_milestone_billing?: boolean
          modo?: Database["public"]["Enums"]["contract_mode"]
          motivo_cancelacion?: string | null
          name?: string
          notas_comerciales?: string | null
          notes?: string | null
          observaciones?: string | null
          owner_consultant_id?: string | null
          payment_schedule_config?: Json
          payment_schedule_type?: Database["public"]["Enums"]["payment_schedule_type"]
          puede_renovarse?: boolean
          requires_client_tickets?: boolean
          sla_id?: string | null
          sprint_cadence?: Database["public"]["Enums"]["sprint_cadence"] | null
          sprint_duration_days?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          type?: Database["public"]["Enums"]["contract_type"]
          updated_at?: string
          vendedor_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_contrato_padre_id_fkey"
            columns: ["contrato_padre_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_sla_id_fkey"
            columns: ["sla_id"]
            isOneToOne: false
            referencedRelation: "slas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_rates: {
        Row: {
          base_currency: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          rate_date: string
          rate_to_base: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          created_by?: string | null
          currency: string
          id?: string
          notes?: string | null
          rate_date?: string
          rate_to_base: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          rate_date?: string
          rate_to_base?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "currency_rates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_tasks: {
        Row: {
          assignee_ids: string[]
          deleted_at: string
          deleted_by: string | null
          id: string
          project_id: string | null
          project_name: string | null
          restored_at: string | null
          restored_by: string | null
          snapshot: Json
          task_id: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          assignee_ids?: string[]
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          project_id?: string | null
          project_name?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot: Json
          task_id: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          assignee_ids?: string[]
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          project_id?: string | null
          project_name?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot?: Json
          task_id?: string
          title?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      internal_project_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_project_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          cantidad: number
          contract_payment_id: string | null
          created_at: string
          currency: string
          descripcion: string
          id: string
          invoice_id: string
          monto: number
          monto_unitario: number
          orden: number
        }
        Insert: {
          cantidad?: number
          contract_payment_id?: string | null
          created_at?: string
          currency?: string
          descripcion: string
          id?: string
          invoice_id: string
          monto?: number
          monto_unitario?: number
          orden?: number
        }
        Update: {
          cantidad?: number
          contract_payment_id?: string | null
          created_at?: string
          currency?: string
          descripcion?: string
          id?: string
          invoice_id?: string
          monto?: number
          monto_unitario?: number
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_contract_payment_id_fkey"
            columns: ["contract_payment_id"]
            isOneToOne: false
            referencedRelation: "contract_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_id: string | null
          anio: number | null
          billing_entity_id: string | null
          cancelada_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          descripcion: string | null
          dtes_asociados: Json
          emitido_at: string | null
          estado: Database["public"]["Enums"]["invoice_status"]
          fecha_emision: string | null
          fecha_vencimiento: string | null
          folio_sii: string | null
          id: string
          mes: number | null
          monto_clp: number | null
          monto_iva: number
          monto_neto: number
          monto_total: number
          motivo_cancelacion: string | null
          notas: string | null
          numero_interno: string | null
          pagada_at: string | null
          pdf_url: string | null
          tipo_dte: number
          token_sii: string | null
          updated_at: string
          workspace_id: string
          xml_url: string | null
        }
        Insert: {
          account_id?: string | null
          anio?: number | null
          billing_entity_id?: string | null
          cancelada_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          descripcion?: string | null
          dtes_asociados?: Json
          emitido_at?: string | null
          estado?: Database["public"]["Enums"]["invoice_status"]
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          folio_sii?: string | null
          id?: string
          mes?: number | null
          monto_clp?: number | null
          monto_iva?: number
          monto_neto?: number
          monto_total?: number
          motivo_cancelacion?: string | null
          notas?: string | null
          numero_interno?: string | null
          pagada_at?: string | null
          pdf_url?: string | null
          tipo_dte?: number
          token_sii?: string | null
          updated_at?: string
          workspace_id: string
          xml_url?: string | null
        }
        Update: {
          account_id?: string | null
          anio?: number | null
          billing_entity_id?: string | null
          cancelada_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          descripcion?: string | null
          dtes_asociados?: Json
          emitido_at?: string | null
          estado?: Database["public"]["Enums"]["invoice_status"]
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          folio_sii?: string | null
          id?: string
          mes?: number | null
          monto_clp?: number | null
          monto_iva?: number
          monto_neto?: number
          monto_total?: number
          motivo_cancelacion?: string | null
          notas?: string | null
          numero_interno?: string | null
          pagada_at?: string | null
          pdf_url?: string | null
          tipo_dte?: number
          token_sii?: string | null
          updated_at?: string
          workspace_id?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_billing_entity_id_fkey"
            columns: ["billing_entity_id"]
            isOneToOne: false
            referencedRelation: "account_billing_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_channels: {
        Row: {
          color: string
          created_at: string
          hubspot_channel_id: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          hubspot_channel_id?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          hubspot_channel_id?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      member_cost_rates: {
        Row: {
          costo_hora: number
          created_at: string
          currency: string
          effective_from: string
          id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          costo_hora: number
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          costo_hora?: number
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_cost_rates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_hito_links: {
        Row: {
          created_at: string
          id: string
          milestone_id: string
          payment_id: string
          tipo_vinculo: Database["public"]["Enums"]["milestone_link_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          milestone_id: string
          payment_id: string
          tipo_vinculo?: Database["public"]["Enums"]["milestone_link_type"]
        }
        Update: {
          created_at?: string
          id?: string
          milestone_id?: string
          payment_id?: string
          tipo_vinculo?: Database["public"]["Enums"]["milestone_link_type"]
        }
        Relationships: [
          {
            foreignKeyName: "milestone_hito_links_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_hito_links_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "contract_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          achieved_at: string | null
          amount: number | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_billable_event: boolean
          name: string
          phase_id: string | null
          project_id: string
          status: Database["public"]["Enums"]["milestone_status"]
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          amount?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_billable_event?: boolean
          name: string
          phase_id?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          amount?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_billable_event?: boolean
          name?: string
          phase_id?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          desktop: boolean
          email: boolean
          in_app: boolean
          kind: string
          slack: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          desktop?: boolean
          email?: boolean
          in_app?: boolean
          kind: string
          slack?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          desktop?: boolean
          email?: boolean
          in_app?: boolean
          kind?: string
          slack?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          channels_sent: Json
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          read_at: string | null
          title: string
          url: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          channels_sent?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          read_at?: string | null
          title: string
          url?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          channels_sent?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          url?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          billing_entity: string | null
          country: string | null
          created_at: string
          external_billing_system: string | null
          id: string
          name: string
          notes: string | null
          partner_account_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_entity?: string | null
          country?: string | null
          created_at?: string
          external_billing_system?: string | null
          id?: string
          name: string
          notes?: string | null
          partner_account_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_entity?: string | null
          country?: string | null
          created_at?: string
          external_billing_system?: string | null
          id?: string
          name?: string
          notes?: string | null
          partner_account_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lag_days: number
          predecessor_phase_id: string
          project_id: string
          successor_phase_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lag_days?: number
          predecessor_phase_id: string
          project_id: string
          successor_phase_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lag_days?: number
          predecessor_phase_id?: string
          project_id?: string
          successor_phase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_dependencies_predecessor_phase_id_fkey"
            columns: ["predecessor_phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_dependencies_successor_phase_id_fkey"
            columns: ["successor_phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          color: string | null
          created_at: string
          end_date: string | null
          id: string
          is_ticket_inbox: boolean
          name: string
          order_index: number
          owner_id: string | null
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["phase_status"]
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_ticket_inbox?: boolean
          name: string
          order_index?: number
          owner_id?: string | null
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["phase_status"]
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_ticket_inbox?: boolean
          name?: string
          order_index?: number
          owner_id?: string | null
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["phase_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_carousel_slides: {
        Row: {
          created_at: string
          id: string
          piece_id: string
          role: Database["public"]["Enums"]["carousel_slide_role"]
          slide_index: number
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          piece_id: string
          role: Database["public"]["Enums"]["carousel_slide_role"]
          slide_index: number
          text?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          piece_id?: string
          role?: Database["public"]["Enums"]["carousel_slide_role"]
          slide_index?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_carousel_slides_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_channel_copies: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["piece_channel"]
          created_at: string
          hashtags: string[]
          id: string
          piece_id: string
          updated_at: string
        }
        Insert: {
          body?: string
          channel: Database["public"]["Enums"]["piece_channel"]
          created_at?: string
          hashtags?: string[]
          id?: string
          piece_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["piece_channel"]
          created_at?: string
          hashtags?: string[]
          id?: string
          piece_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_channel_copies_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_poll: {
        Row: {
          created_at: string
          options: string[]
          piece_id: string
          question: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          options?: string[]
          piece_id: string
          question?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          options?: string[]
          piece_id?: string
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_poll_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: true
            referencedRelation: "content_pieces_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_video_sections: {
        Row: {
          created_at: string
          end_ts: string | null
          id: string
          piece_id: string
          recording_notes: string | null
          script: string
          section: Database["public"]["Enums"]["video_section"]
          start_ts: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_ts?: string | null
          id?: string
          piece_id: string
          recording_notes?: string | null
          script?: string
          section: Database["public"]["Enums"]["video_section"]
          start_ts?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_ts?: string | null
          id?: string
          piece_id?: string
          recording_notes?: string | null
          script?: string
          section?: Database["public"]["Enums"]["video_section"]
          start_ts?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_video_sections_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          handle: string | null
          id: string
          preferences: Json
          slack_user_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          handle?: string | null
          id: string
          preferences?: Json
          slack_user_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          handle?: string | null
          id?: string
          preferences?: Json
          slack_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_hour_budget: {
        Row: {
          costo_hora: number | null
          created_at: string
          horas_estimadas: number
          id: string
          orden: number
          project_id: string
          rol: string
          updated_at: string
        }
        Insert: {
          costo_hora?: number | null
          created_at?: string
          horas_estimadas?: number
          id?: string
          orden?: number
          project_id: string
          rol: string
          updated_at?: string
        }
        Update: {
          costo_hora?: number | null
          created_at?: string
          horas_estimadas?: number
          id?: string
          orden?: number
          project_id?: string
          rol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_hour_budget_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_service_lines: {
        Row: {
          created_at: string
          id: string
          project_id: string
          service_line_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          service_line_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          service_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_service_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_lines_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "contract_service_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      project_share_tokens: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          project_id: string
          revoked_at: string | null
          scope: string
          token: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          project_id: string
          revoked_at?: string | null
          scope?: string
          token: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          project_id?: string
          revoked_at?: string | null
          scope?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_share_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          alerta_margen: boolean
          archived: boolean
          area: Database["public"]["Enums"]["area"]
          asana_project_gid: string | null
          billing_mode: Database["public"]["Enums"]["project_billing_mode"]
          client_name: string | null
          color: string | null
          contract_id: string | null
          created_at: string
          created_by: string
          default_billable: boolean
          delivery_type:
            | Database["public"]["Enums"]["project_delivery_type"]
            | null
          description: string | null
          fecha_entrega_objetivo: string | null
          fecha_inicio_delivery: string | null
          first_sprint_start_date: string | null
          horas_presupuestadas_total: number | null
          hourly_rate: number | null
          hours_per_sprint: number | null
          icon: string | null
          id: string
          internal_category_id: string | null
          is_primary: boolean
          lead_id: string | null
          margen_estimado_pct: number | null
          margen_objetivo_pct: number
          name: string
          orden: number
          partner_id: string | null
          sla_id: string | null
          state: Database["public"]["Enums"]["project_state"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          alerta_margen?: boolean
          archived?: boolean
          area?: Database["public"]["Enums"]["area"]
          asana_project_gid?: string | null
          billing_mode?: Database["public"]["Enums"]["project_billing_mode"]
          client_name?: string | null
          color?: string | null
          contract_id?: string | null
          created_at?: string
          created_by: string
          default_billable?: boolean
          delivery_type?:
            | Database["public"]["Enums"]["project_delivery_type"]
            | null
          description?: string | null
          fecha_entrega_objetivo?: string | null
          fecha_inicio_delivery?: string | null
          first_sprint_start_date?: string | null
          horas_presupuestadas_total?: number | null
          hourly_rate?: number | null
          hours_per_sprint?: number | null
          icon?: string | null
          id?: string
          internal_category_id?: string | null
          is_primary?: boolean
          lead_id?: string | null
          margen_estimado_pct?: number | null
          margen_objetivo_pct?: number
          name: string
          orden?: number
          partner_id?: string | null
          sla_id?: string | null
          state?: Database["public"]["Enums"]["project_state"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          alerta_margen?: boolean
          archived?: boolean
          area?: Database["public"]["Enums"]["area"]
          asana_project_gid?: string | null
          billing_mode?: Database["public"]["Enums"]["project_billing_mode"]
          client_name?: string | null
          color?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string
          default_billable?: boolean
          delivery_type?:
            | Database["public"]["Enums"]["project_delivery_type"]
            | null
          description?: string | null
          fecha_entrega_objetivo?: string | null
          fecha_inicio_delivery?: string | null
          first_sprint_start_date?: string | null
          horas_presupuestadas_total?: number | null
          hourly_rate?: number | null
          hours_per_sprint?: number | null
          icon?: string | null
          id?: string
          internal_category_id?: string | null
          is_primary?: boolean
          lead_id?: string | null
          margen_estimado_pct?: number | null
          margen_objetivo_pct?: number
          name?: string
          orden?: number
          partner_id?: string | null
          sla_id?: string | null
          state?: Database["public"]["Enums"]["project_state"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_internal_category_id_fkey"
            columns: ["internal_category_id"]
            isOneToOne: false
            referencedRelation: "internal_project_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_sla_id_fkey"
            columns: ["sla_id"]
            isOneToOne: false
            referencedRelation: "slas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      role_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          permissions: Database["public"]["Enums"]["workspace_permission"][]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          permissions?: Database["public"]["Enums"]["workspace_permission"][]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          permissions?: Database["public"]["Enums"]["workspace_permission"][]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          id: string
          name: string
          orden: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          name: string
          orden?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          name?: string
          orden?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_targets: {
        Row: {
          business_hours: boolean
          created_at: string
          id: string
          level: Database["public"]["Enums"]["sla_level"]
          response_target_minutes: number | null
          sla_id: string
          target_minutes: number
          ticket_type: Database["public"]["Enums"]["sla_ticket_type"]
          updated_at: string
        }
        Insert: {
          business_hours?: boolean
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["sla_level"]
          response_target_minutes?: number | null
          sla_id: string
          target_minutes: number
          ticket_type: Database["public"]["Enums"]["sla_ticket_type"]
          updated_at?: string
        }
        Update: {
          business_hours?: boolean
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["sla_level"]
          response_target_minutes?: number | null
          sla_id?: string
          target_minutes?: number
          ticket_type?: Database["public"]["Enums"]["sla_ticket_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_targets_sla_id_fkey"
            columns: ["sla_id"]
            isOneToOne: false
            referencedRelation: "slas"
            referencedColumns: ["id"]
          },
        ]
      }
      slas: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_system: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          contract_id: string
          contracted_hours: number
          created_at: string
          end_date: string
          holidays_in: Json
          id: string
          notes: string | null
          project_id: string | null
          sprint_number: number
          start_date: string
          status: Database["public"]["Enums"]["sprint_status"]
          updated_at: string
        }
        Insert: {
          contract_id: string
          contracted_hours?: number
          created_at?: string
          end_date: string
          holidays_in?: Json
          id?: string
          notes?: string | null
          project_id?: string | null
          sprint_number: number
          start_date: string
          status?: Database["public"]["Enums"]["sprint_status"]
          updated_at?: string
        }
        Update: {
          contract_id?: string
          contracted_hours?: number
          created_at?: string
          end_date?: string
          holidays_in?: Json
          id?: string
          notes?: string | null
          project_id?: string | null
          sprint_number?: number
          start_date?: string
          status?: Database["public"]["Enums"]["sprint_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          from_value: string | null
          id: string
          kind: string
          task_id: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          kind: string
          task_id: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: string
          kind?: string
          task_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          created_at: string
          is_primary: boolean
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size: number | null
          task_id: string
          uploader_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size?: number | null
          task_id: string
          uploader_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size?: number | null
          task_id?: string
          uploader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          client_author_email: string | null
          created_at: string
          id: string
          is_client_visible: boolean
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          client_author_email?: string | null
          created_at?: string
          id?: string
          is_client_visible?: boolean
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          client_author_email?: string | null
          created_at?: string
          id?: string
          is_client_visible?: boolean
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lag_days: number
          predecessor_task_id: string
          project_id: string
          successor_task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lag_days?: number
          predecessor_task_id: string
          project_id: string
          successor_task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lag_days?: number
          predecessor_task_id?: string
          project_id?: string
          successor_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_predecessor_task_id_fkey"
            columns: ["predecessor_task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_dependencies_predecessor_task_id_fkey"
            columns: ["predecessor_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_task_id_fkey"
            columns: ["successor_task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_task_id_fkey"
            columns: ["successor_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_estimates: {
        Row: {
          created_at: string
          daily_hours: number | null
          hours: number
          id: string
          manual: boolean
          role: Database["public"]["Enums"]["workspace_role"] | null
          task_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          daily_hours?: number | null
          hours: number
          id?: string
          manual?: boolean
          role?: Database["public"]["Enums"]["workspace_role"] | null
          task_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          daily_hours?: number | null
          hours?: number
          id?: string
          manual?: boolean
          role?: Database["public"]["Enums"]["workspace_role"] | null
          task_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_estimates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_estimates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_statuses: {
        Row: {
          category: Database["public"]["Enums"]["task_status_category"]
          color: string
          created_at: string
          id: string
          is_default: boolean
          is_system: boolean
          key: string
          name: string
          sort_order: number
          task_type_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["task_status_category"]
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_system?: boolean
          key: string
          name: string
          sort_order?: number
          task_type_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["task_status_category"]
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_system?: boolean
          key?: string
          name?: string
          sort_order?: number
          task_type_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_statuses_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_statuses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_types: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_system: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area: Database["public"]["Enums"]["area"]
          assignee_id: string | null
          completed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          effort_mode: Database["public"]["Enums"]["task_effort_mode"]
          external_ref: string | null
          google_calendar_connection_id: string | null
          google_event_html_link: string | null
          google_event_id: string | null
          id: string
          meeting_duration_minutes: number | null
          meeting_start_time: string | null
          meeting_timezone: string | null
          parent_task_id: string | null
          phase_id: string | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          request_type: Database["public"]["Enums"]["sla_ticket_type"] | null
          severity: Database["public"]["Enums"]["sla_level"] | null
          sla_target_resolution_at: string | null
          sla_target_response_at: string | null
          sprint_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_id: string
          submitter_email: string | null
          task_type_id: string | null
          title: string
          total_effort_hours: number | null
          updated_at: string
        }
        Insert: {
          area?: Database["public"]["Enums"]["area"]
          assignee_id?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          effort_mode?: Database["public"]["Enums"]["task_effort_mode"]
          external_ref?: string | null
          google_calendar_connection_id?: string | null
          google_event_html_link?: string | null
          google_event_id?: string | null
          id?: string
          meeting_duration_minutes?: number | null
          meeting_start_time?: string | null
          meeting_timezone?: string | null
          parent_task_id?: string | null
          phase_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          request_type?: Database["public"]["Enums"]["sla_ticket_type"] | null
          severity?: Database["public"]["Enums"]["sla_level"] | null
          sla_target_resolution_at?: string | null
          sla_target_response_at?: string | null
          sprint_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          status_id: string
          submitter_email?: string | null
          task_type_id?: string | null
          title: string
          total_effort_hours?: number | null
          updated_at?: string
        }
        Update: {
          area?: Database["public"]["Enums"]["area"]
          assignee_id?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          effort_mode?: Database["public"]["Enums"]["task_effort_mode"]
          external_ref?: string | null
          google_calendar_connection_id?: string | null
          google_event_html_link?: string | null
          google_event_id?: string | null
          id?: string
          meeting_duration_minutes?: number | null
          meeting_start_time?: string | null
          meeting_timezone?: string | null
          parent_task_id?: string | null
          phase_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          request_type?: Database["public"]["Enums"]["sla_ticket_type"] | null
          severity?: Database["public"]["Enums"]["sla_level"] | null
          sla_target_resolution_at?: string | null
          sla_target_response_at?: string | null
          sprint_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          status_id?: string
          submitter_email?: string | null
          task_type_id?: string | null
          title?: string
          total_effort_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_google_calendar_connection_id_fkey"
            columns: ["google_calendar_connection_id"]
            isOneToOne: false
            referencedRelation: "user_calendar_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          calendar_event_id: string | null
          content_piece_id: string | null
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          id: string
          is_billable: boolean
          note: string | null
          source: Database["public"]["Enums"]["time_entry_source"]
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          content_piece_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_billable?: boolean
          note?: string | null
          source?: Database["public"]["Enums"]["time_entry_source"]
          started_at: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          content_piece_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_billable?: boolean
          note?: string | null
          source?: Database["public"]["Enums"]["time_entry_source"]
          started_at?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_content_piece_id_fkey"
            columns: ["content_piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_estimate_rollup"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendar_connections: {
        Row: {
          access_token: string | null
          created_at: string
          google_account_email: string
          id: string
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["calendar_connection_status"]
          sync_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          google_account_email: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["calendar_connection_status"]
          sync_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          google_account_email?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["calendar_connection_status"]
          sync_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_calendar_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_capacity: {
        Row: {
          created_at: string
          currency: string
          daily_hours: number
          hourly_rate: number | null
          id: string
          max_timer_hours: number
          pattern_custom: boolean
          updated_at: string
          user_id: string
          weekly_pattern: number[]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          daily_hours?: number
          hourly_rate?: number | null
          id?: string
          max_timer_hours?: number
          pattern_custom?: boolean
          updated_at?: string
          user_id: string
          weekly_pattern?: number[]
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          daily_hours?: number
          hourly_rate?: number | null
          id?: string
          max_timer_hours?: number
          pattern_custom?: boolean
          updated_at?: string
          user_id?: string
          weekly_pattern?: number[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capacity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_dte_config: {
        Row: {
          activo: boolean
          ambiente: string
          api_key: string | null
          created_at: string
          fecha_resolucion: string | null
          provider: string
          resolucion_sii: string | null
          rut_emisor: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          activo?: boolean
          ambiente?: string
          api_key?: string | null
          created_at?: string
          fecha_resolucion?: string | null
          provider?: string
          resolucion_sii?: string | null
          rut_emisor?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          activo?: boolean
          ambiente?: string
          api_key?: string | null
          created_at?: string
          fecha_resolucion?: string | null
          provider?: string
          resolucion_sii?: string | null
          rut_emisor?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_dte_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_emisor: {
        Row: {
          acteco: number | null
          banco: string | null
          cobranza_activa: boolean | null
          cobranza_cc_emails: string[] | null
          cobranza_dias_recordatorio: number | null
          comuna: string | null
          created_at: string
          direccion: string | null
          email_contacto: string | null
          email_finanzas: string | null
          giro: string | null
          numero_cuenta: string | null
          razon_social: string | null
          rut: string | null
          telefono: string | null
          tipo_cuenta: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acteco?: number | null
          banco?: string | null
          cobranza_activa?: boolean | null
          cobranza_cc_emails?: string[] | null
          cobranza_dias_recordatorio?: number | null
          comuna?: string | null
          created_at?: string
          direccion?: string | null
          email_contacto?: string | null
          email_finanzas?: string | null
          giro?: string | null
          numero_cuenta?: string | null
          razon_social?: string | null
          rut?: string | null
          telefono?: string | null
          tipo_cuenta?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          acteco?: number | null
          banco?: string | null
          cobranza_activa?: boolean | null
          cobranza_cc_emails?: string[] | null
          cobranza_dias_recordatorio?: number | null
          comuna?: string | null
          created_at?: string
          direccion?: string | null
          email_contacto?: string | null
          email_finanzas?: string | null
          giro?: string | null
          numero_cuenta?: string | null
          razon_social?: string | null
          rut?: string | null
          telefono?: string | null
          tipo_cuenta?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_emisor_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_holidays: {
        Row: {
          affects: Database["public"]["Enums"]["holiday_scope"]
          created_at: string
          date: string
          id: string
          name: string
          portion: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          affects?: Database["public"]["Enums"]["holiday_scope"]
          created_at?: string
          date: string
          id?: string
          name: string
          portion?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          affects?: Database["public"]["Enums"]["holiday_scope"]
          created_at?: string
          date?: string
          id?: string
          name?: string
          portion?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_holidays_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          role_template_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          role_template_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          role_template_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_role_template_id_fkey"
            columns: ["role_template_id"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          extra_permissions: Database["public"]["Enums"]["workspace_permission"][]
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          role_template_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          extra_permissions?: Database["public"]["Enums"]["workspace_permission"][]
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          role_template_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          extra_permissions?: Database["public"]["Enums"]["workspace_permission"][]
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          role_template_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_role_template_id_fkey"
            columns: ["role_template_id"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          allocation_strategy: Database["public"]["Enums"]["allocation_strategy"]
          color: string | null
          created_at: string
          id: string
          internal_counts_in_workload: boolean
          kind: Database["public"]["Enums"]["workspace_kind"]
          name: string
          owner_id: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          allocation_strategy?: Database["public"]["Enums"]["allocation_strategy"]
          color?: string | null
          created_at?: string
          id?: string
          internal_counts_in_workload?: boolean
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name: string
          owner_id: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          allocation_strategy?: Database["public"]["Enums"]["allocation_strategy"]
          color?: string | null
          created_at?: string
          id?: string
          internal_counts_in_workload?: boolean
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name?: string
          owner_id?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      task_estimate_rollup: {
        Row: {
          project_id: string | null
          task_id: string | null
          total_estimate_hours: number | null
          total_logged_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_business_days: {
        Args: { _days: number; _start: string; _ws: string }
        Returns: string
      }
      apply_contract_billing_splits: {
        Args: { _contract_id: string }
        Returns: number
      }
      auto_advance_sprint_phase_statuses: { Args: never; Returns: undefined }
      can_access_account: {
        Args: { _account_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      check_due_tasks: { Args: never; Returns: number }
      compute_project_margin: { Args: { _project_id: string }; Returns: number }
      confirm_calendar_meeting: {
        Args: {
          _duration_minutes: number
          _event_id: string
          _phase_id: string
          _project_id: string
          _sprint_id: string
        }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_notification: {
        Args: {
          _actor_id: string
          _body: string
          _entity_id: string
          _entity_type: string
          _kind: string
          _title: string
          _url: string
          _user_id: string
          _workspace_id: string
        }
        Returns: undefined
      }
      ensure_client_ticket_form: {
        Args: { _project_id: string }
        Returns: string
      }
      generate_contract_monthly_payments: {
        Args: { _contract_id: string }
        Returns: undefined
      }
      generate_contract_sprints: {
        Args: {
          _contract_id: string
          _hours_per_sprint: number
          _sprint_days: number
        }
        Returns: number
      }
      generate_contract_sprints_from_cadence: {
        Args: { _contract_id: string; _first_start: string }
        Returns: number
      }
      generate_project_sprints: {
        Args: { _first_start?: string; _project_id: string }
        Returns: number
      }
      get_contract_sprint_summary: {
        Args: { _contract_id: string }
        Returns: {
          contracted_hours: number
          end_date: string
          estimated_hours: number
          project_id: string
          project_name: string
          real_hours: number
          sprint_id: string
          sprint_number: number
          start_date: string
          status: string
          tasks_done: number
          tasks_total: number
        }[]
      }
      get_finance_dashboard: { Args: { _workspace_id: string }; Returns: Json }
      get_notification_channels: {
        Args: { _kind: string; _user_id: string }
        Returns: {
          desktop: boolean
          email: boolean
          in_app: boolean
          slack: boolean
        }[]
      }
      get_project_time_health: {
        Args: { p_project_id: string }
        Returns: {
          estimate_hours: number
          logged_hours: number
          task_count: number
        }[]
      }
      get_workspace_project_health: {
        Args: { p_workspace_id: string }
        Returns: {
          estimate_hours: number
          logged_hours: number
          project_id: string
        }[]
      }
      has_permission: {
        Args: {
          _perm: Database["public"]["Enums"]["workspace_permission"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      insert_phase_raw: {
        Args: {
          _end_date: string
          _name: string
          _order_index: number
          _project_id: string
          _start_date: string
        }
        Returns: {
          color: string | null
          created_at: string
          end_date: string | null
          id: string
          is_ticket_inbox: boolean
          name: string
          order_index: number
          owner_id: string | null
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["phase_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "phases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_sprints_bulk: {
        Args: {
          _contract_id: string
          _first_start: string
          _from_number: number
          _hours: number
          _sprint_days: number
          _to_number: number
        }
        Returns: number
      }
      insert_task_assignees_bulk: { Args: { _rows: Json }; Returns: number }
      insert_task_recurrence_batch: {
        Args: { _rows: Json }
        Returns: {
          id: string
        }[]
      }
      is_non_working_day: {
        Args: { _date: string; _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      list_my_permissions: {
        Args: { _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_permission"][]
      }
      list_workspace_payments: {
        Args: {
          _from_date?: string
          _status?: string
          _to_date?: string
          _workspace_id: string
        }
        Returns: {
          account_name: string
          amount: number
          contract_id: string
          contract_name: string
          created_at: string
          currency: string
          description: string
          due_date: string
          emitido_at: string
          es_uf_estimada: boolean
          fecha_emision: string
          folio_sii: string
          has_pdf: boolean
          id: string
          invoice_estado: string
          invoice_id: string
          kind: string
          milestone_id: string
          monto_clp: number
          notes: string
          paid_at: string
          pdf_url: string
          period_label: string
          ready_to_invoice: boolean
          service_line_id: string
          status: string
          uf_fecha: string
          uf_usada: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      project_account_visible: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      purge_deleted_tasks: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_meeting_task_estimate: {
        Args: { _task_id: string }
        Returns: undefined
      }
      recalc_phase_dates: { Args: { _root: string }; Returns: undefined }
      recalc_task_dates: { Args: { _root: string }; Returns: undefined }
      recompute_task_estimate_split: {
        Args: { _task_id: string }
        Returns: undefined
      }
      regenerate_sprint_dates: {
        Args: {
          _contract_id: string
          _first_start: string
          _sprint_days: number
        }
        Returns: number
      }
      restore_deleted_task: { Args: { p_id: string }; Returns: string }
      seed_default_pillars: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      seed_workspace_internal_categories: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      seed_workspace_role_templates: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      seed_workspace_slas: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      seed_workspace_task_types: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      shares_workspace_with: {
        Args: { _a: string; _b: string }
        Returns: boolean
      }
      update_phase_raw: {
        Args: {
          _end_date: string
          _id: string
          _name: string
          _order_index: number
          _start_date: string
        }
        Returns: {
          color: string | null
          created_at: string
          end_date: string | null
          id: string
          is_ticket_inbox: boolean
          name: string
          order_index: number
          owner_id: string | null
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["phase_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "phases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_sprint_raw:
        | {
            Args: {
              _contract_id: string
              _contracted_hours: number
              _end_date: string
              _notes: string
              _sprint_number: number
              _start_date: string
            }
            Returns: string
          }
        | {
            Args: {
              _contract_id: string
              _contracted_hours: number
              _end_date: string
              _notes: string
              _project_id: string
              _sprint_number: number
              _start_date: string
            }
            Returns: string
          }
    }
    Enums: {
      account_status: "active" | "paused" | "archived"
      allocation_strategy: "due_date" | "spread" | "fit_capacity"
      app_role: "admin" | "user" | "super_admin"
      area: "operations" | "marketing" | "finance" | "internal"
      asana_sync_status: "idle" | "syncing" | "error" | "paused"
      calendar_connection_status: "active" | "needs_reauth" | "revoked"
      calendar_event_inbox_status:
        | "pending"
        | "classified"
        | "ignored"
        | "private"
      campaign_status:
        | "idea"
        | "planning"
        | "in_execution"
        | "live"
        | "measuring"
        | "closed"
      carousel_slide_role:
        | "portada"
        | "contexto"
        | "punto1"
        | "punto2"
        | "punto3"
        | "cierre_cta"
      commission_status: "pendiente" | "aprobada" | "pagada" | "cancelada"
      content_piece_status:
        | "idea"
        | "draft"
        | "in_review"
        | "approved"
        | "scheduled"
        | "published"
        | "archived"
      contract_billing_model: "fixed" | "monthly" | "mixed"
      contract_mode: "simple" | "multiservicio"
      contract_status:
        | "borrador"
        | "proyectado"
        | "activo"
        | "paused"
        | "finalizado"
        | "cancelado"
        | "en_renovacion"
      contract_type: "implementation" | "recurrente"
      handoff_state: "pendiente" | "en_planificacion" | "completado"
      holiday_scope: "all" | "user"
      invoice_status: "draft" | "scheduled" | "emitted" | "paid" | "cancelled"
      milestone_link_type: "gatilla_facturacion" | "solo_referencia"
      milestone_status: "pending" | "achieved" | "invoiced"
      payment_kind: "monthly" | "milestone" | "custom"
      payment_schedule_type:
        | "monthly_fixed"
        | "per_milestone"
        | "mixed"
        | "none"
      payment_status:
        | "scheduled"
        | "invoiced"
        | "paid"
        | "overdue"
        | "cancelled"
      phase_status: "sin_iniciar" | "en_curso" | "completada" | "demorada"
      piece_channel: "instagram" | "tiktok" | "linkedin" | "youtube"
      piece_format: "carrusel" | "reel" | "post" | "encuesta" | "demo" | "video"
      piece_status_v2:
        | "idea"
        | "copy"
        | "diseno"
        | "revision"
        | "programada"
        | "publicada"
      project_billing_mode: "internal" | "partner" | "internal_no_contract"
      project_delivery_type: "proyecto" | "raas"
      project_state:
        | "planificacion"
        | "en_curso"
        | "en_riesgo"
        | "entregado"
        | "cerrado"
      service_frequency:
        | "mensual"
        | "trimestral"
        | "semestral"
        | "anual"
        | "unica"
        | "hitos"
      sla_level: "normal" | "urgente_critico"
      sla_ticket_type: "incidencia" | "requerimiento"
      sprint_cadence: "monthly" | "biweekly" | "weekly"
      sprint_status: "planificado" | "en_curso" | "cerrado" | "por_planificar"
      task_effort_mode: "basic" | "flexible" | "fixed_daily" | "due_date"
      task_priority: "none" | "low" | "medium" | "high" | "urgent"
      task_status:
        | "nueva"
        | "planificada"
        | "en_curso"
        | "en_pausa"
        | "revision_interna"
        | "revision_cliente"
        | "en_correccion"
        | "demorada"
        | "completada"
        | "cancelada"
      task_status_category:
        | "abierta"
        | "en_progreso"
        | "bloqueada"
        | "completada"
        | "cancelada"
      time_entry_source: "manual" | "timer" | "auto_stopped" | "calendar"
      video_section: "hook" | "desarrollo" | "cierre"
      workspace_kind: "internal" | "operations"
      workspace_permission:
        | "ops_view"
        | "ops_manage"
        | "workload_view"
        | "reports_view"
        | "finance_view"
        | "finance_manage"
        | "admin_members"
        | "admin_roles"
        | "admin_settings"
        | "admin_capacity"
        | "finance_commission_manage"
        | "finance_invoice"
        | "marketing_view"
        | "marketing_manage"
        | "internal_view"
        | "internal_manage"
      workspace_role: "owner" | "admin" | "member" | "guest" | "super_admin"
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
      account_status: ["active", "paused", "archived"],
      allocation_strategy: ["due_date", "spread", "fit_capacity"],
      app_role: ["admin", "user", "super_admin"],
      area: ["operations", "marketing", "finance", "internal"],
      asana_sync_status: ["idle", "syncing", "error", "paused"],
      calendar_connection_status: ["active", "needs_reauth", "revoked"],
      calendar_event_inbox_status: [
        "pending",
        "classified",
        "ignored",
        "private",
      ],
      campaign_status: [
        "idea",
        "planning",
        "in_execution",
        "live",
        "measuring",
        "closed",
      ],
      carousel_slide_role: [
        "portada",
        "contexto",
        "punto1",
        "punto2",
        "punto3",
        "cierre_cta",
      ],
      commission_status: ["pendiente", "aprobada", "pagada", "cancelada"],
      content_piece_status: [
        "idea",
        "draft",
        "in_review",
        "approved",
        "scheduled",
        "published",
        "archived",
      ],
      contract_billing_model: ["fixed", "monthly", "mixed"],
      contract_mode: ["simple", "multiservicio"],
      contract_status: [
        "borrador",
        "proyectado",
        "activo",
        "paused",
        "finalizado",
        "cancelado",
        "en_renovacion",
      ],
      contract_type: ["implementation", "recurrente"],
      handoff_state: ["pendiente", "en_planificacion", "completado"],
      holiday_scope: ["all", "user"],
      invoice_status: ["draft", "scheduled", "emitted", "paid", "cancelled"],
      milestone_link_type: ["gatilla_facturacion", "solo_referencia"],
      milestone_status: ["pending", "achieved", "invoiced"],
      payment_kind: ["monthly", "milestone", "custom"],
      payment_schedule_type: [
        "monthly_fixed",
        "per_milestone",
        "mixed",
        "none",
      ],
      payment_status: ["scheduled", "invoiced", "paid", "overdue", "cancelled"],
      phase_status: ["sin_iniciar", "en_curso", "completada", "demorada"],
      piece_channel: ["instagram", "tiktok", "linkedin", "youtube"],
      piece_format: ["carrusel", "reel", "post", "encuesta", "demo", "video"],
      piece_status_v2: [
        "idea",
        "copy",
        "diseno",
        "revision",
        "programada",
        "publicada",
      ],
      project_billing_mode: ["internal", "partner", "internal_no_contract"],
      project_delivery_type: ["proyecto", "raas"],
      project_state: [
        "planificacion",
        "en_curso",
        "en_riesgo",
        "entregado",
        "cerrado",
      ],
      service_frequency: [
        "mensual",
        "trimestral",
        "semestral",
        "anual",
        "unica",
        "hitos",
      ],
      sla_level: ["normal", "urgente_critico"],
      sla_ticket_type: ["incidencia", "requerimiento"],
      sprint_cadence: ["monthly", "biweekly", "weekly"],
      sprint_status: ["planificado", "en_curso", "cerrado", "por_planificar"],
      task_effort_mode: ["basic", "flexible", "fixed_daily", "due_date"],
      task_priority: ["none", "low", "medium", "high", "urgent"],
      task_status: [
        "nueva",
        "planificada",
        "en_curso",
        "en_pausa",
        "revision_interna",
        "revision_cliente",
        "en_correccion",
        "demorada",
        "completada",
        "cancelada",
      ],
      task_status_category: [
        "abierta",
        "en_progreso",
        "bloqueada",
        "completada",
        "cancelada",
      ],
      time_entry_source: ["manual", "timer", "auto_stopped", "calendar"],
      video_section: ["hook", "desarrollo", "cierre"],
      workspace_kind: ["internal", "operations"],
      workspace_permission: [
        "ops_view",
        "ops_manage",
        "workload_view",
        "reports_view",
        "finance_view",
        "finance_manage",
        "admin_members",
        "admin_roles",
        "admin_settings",
        "admin_capacity",
        "finance_commission_manage",
        "finance_invoice",
        "marketing_view",
        "marketing_manage",
        "internal_view",
        "internal_manage",
      ],
      workspace_role: ["owner", "admin", "member", "guest", "super_admin"],
    },
  },
} as const
