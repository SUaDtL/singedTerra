export type RoomStatus = "waiting" | "active" | "finished";

export interface StoredPlayer {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  lastSeen?: number;
  ai?: "easy" | "medium" | "hard";
  loadout?: import("./tankLoadout.ts").TankLoadout;
}

export interface StoredOptions {
  maxPlayers: number;
  maxWind: number;
  gravity: number;
  rulesetVersion?: 1 | 2 | 3;
  walls?: "open" | "reflective" | "wrap" | "concrete";
  battlefieldWorld?: "ember-dusk" | "obsidian-caldera" | "glassstorm-expanse";
  hazards?: "none" | "lava";
  visibility?: "public" | "private";
  rounds?: number;
  armsLevel?: number;
  interestRate?: number;
  suddenDeathTurn?: number;
  teamMode?: boolean;
}

export type StoredAction =
  | { type: "fire"; angle: number; power: number; weapon: string }
  | { type: "use_shield" }
  | { type: "buy"; weapon?: string; accessory?: string; tankId?: string }
  | { type: "next_round" }
  | { type: "move"; delta: number };

export interface StoredScoreEntry {
  tankId: string;
  playerName: string;
  roundWins: number;
  kills: number;
  totalDamage: number;
}

export interface RoomReapTrim {
  id: string;
  players: StoredPlayer[];
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string; created_at: string; updated_at: string };
        Insert: { id: string; display_name: string; created_at?: string; updated_at?: string };
        Update: { display_name?: string; updated_at?: string };
        Relationships: [];
      };
      verified_deployments: {
        Row: {
          id: string;
          user_id: string;
          config: Record<string, unknown>;
          contract_version: number;
          engine_version: number;
          ruleset_version: number;
          status: "active" | "completed" | "expired" | "abandoned";
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          code: string;
          seed: number;
          status: RoomStatus;
          options: StoredOptions;
          players: StoredPlayer[];
          active_player_index: number;
          turn: number;
          winner: string | null;
          created_at: string;
          rematch_room_id: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          seed: number;
          status?: RoomStatus;
          options?: StoredOptions;
          players?: StoredPlayer[];
          active_player_index?: number;
          turn?: number;
          winner?: string | null;
          created_at?: string;
          rematch_room_id?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          seed?: number;
          status?: RoomStatus;
          options?: StoredOptions;
          players?: StoredPlayer[];
          active_player_index?: number;
          turn?: number;
          winner?: string | null;
          created_at?: string;
          rematch_room_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rooms_rematch_room_id_fkey";
            columns: ["rematch_room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      room_actions: {
        Row: {
          id: string;
          room_id: string;
          seq: number;
          player_id: string;
          action: StoredAction;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          seq: number;
          player_id: string;
          action: StoredAction;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          seq?: number;
          player_id?: string;
          action?: StoredAction;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_actions_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      match_scores: {
        Row: {
          id: string;
          room_id: string;
          winner: string | null;
          rounds: number;
          scoreboard: StoredScoreEntry[];
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          winner?: string | null;
          rounds: number;
          scoreboard: StoredScoreEntry[];
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          winner?: string | null;
          rounds?: number;
          scoreboard?: StoredScoreEntry[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_scores_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: true;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      match_participants: {
        Row: {
          room_id: string;
          user_id: string;
          player_id: string;
          tank_id: string;
          created_at: string;
        };
        Insert: {
          room_id: string;
          user_id: string;
          player_id: string;
          tank_id: string;
          created_at?: string;
        };
        Update: {
          room_id?: string;
          user_id?: string;
          player_id?: string;
          tank_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_participants_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "match_scores";
            referencedColumns: ["room_id"];
          },
          {
            foreignKeyName: "match_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      hotseat_match_results: {
        Row: {
          user_id: string;
          match_id: string;
          won: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          match_id: string;
          won: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          match_id?: string;
          won?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hotseat_match_results_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limits: {
        Row: { bucket: string; window_start: number; count: number };
        Insert: { bucket: string; window_start: number; count?: number };
        Update: { bucket?: string; window_start?: number; count?: number };
        Relationships: [];
      };
      room_seats: {
        Row: {
          room_id: string;
          seat_id: string;
          token: string;
          created_at: string;
        };
        Insert: {
          room_id: string;
          seat_id: string;
          token: string;
          created_at?: string;
        };
        Update: {
          room_id?: string;
          seat_id?: string;
          token?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_seats_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {};
    Functions: {
      apply_room_reap: {
        Args: { p_dead: string[]; p_trims: RoomReapTrim[] };
        Returns: undefined;
      };
      bump_rate_limit: {
        Args: { p_bucket: string; p_window: number };
        Returns: number;
      };
      start_verified_deployment: {
        Args: { p_user_id: string; p_config: Record<string, unknown>; p_expires_at: string };
        Returns: Array<Database["public"]["Tables"]["verified_deployments"]["Row"] & { resumed: boolean }>;
      };
      abandon_verified_deployment: {
        Args: { p_user_id: string; p_session_id: string };
        Returns: Database["public"]["Tables"]["verified_deployments"]["Row"][];
      };
      complete_verified_deployment: {
        Args: {
          p_user_id: string;
          p_session_id: string;
          p_transcript: Array<{ angle: number; power: number }>;
          p_won: boolean;
          p_outcome: "win" | "loss" | "draw";
          p_verified_xp: number;
        };
        Returns: Array<{
          session_id: string;
          user_id: string;
          transcript: Array<{ angle: number; power: number }>;
          won: boolean;
          outcome: "win" | "loss" | "draw";
          verified_xp: number;
          prior_verified_matches: number;
          prior_verified_wins: number;
          prior_total_xp: number;
          current_verified_matches: number;
          current_verified_wins: number;
          current_total_xp: number;
          created_at: string;
        }>;
      };
      verified_progression_summary: {
        Args: { p_user_id: string };
        Returns: Array<{
          verified_matches: number;
          verified_wins: number;
          total_xp: number;
        }>;
      };
      verified_deployment_completion_context: {
        Args: { p_user_id: string; p_session_id: string };
        Returns: Array<{
          session_id: string;
          user_id: string;
          config: Record<string, unknown>;
          contract_version: number;
          engine_version: number;
          ruleset_version: number;
          status: "active" | "completed" | "expired" | "abandoned";
          expires_at: string;
          transcript: Array<{ angle: number; power: number }> | null;
          won: boolean | null;
          outcome: "win" | "loss" | "draw" | null;
          verified_xp: number | null;
          prior_verified_matches: number | null;
          prior_verified_wins: number | null;
          prior_total_xp: number | null;
          current_verified_matches: number | null;
          current_verified_wins: number | null;
          current_total_xp: number | null;
          result_created_at: string | null;
        }>;
      };
      submit_room_action: {
        Args: {
          p_room_id: string;
          p_player_id: string;
          p_action: StoredAction;
          p_ends_turn: boolean;
          p_next_index: number;
          p_next_turn: number;
        };
        Returns: number;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};

export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
