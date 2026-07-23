export type RoomStatus = "waiting" | "active" | "finished";

export interface StoredPlayer {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  lastSeen?: number;
  ai?: "easy" | "medium" | "hard";
}

export interface StoredOptions {
  maxPlayers: number;
  maxWind: number;
  gravity: number;
  visibility?: "public" | "private";
  rounds?: number;
  armsLevel?: number;
  interestRate?: number;
  suddenDeathTurn?: number;
}

export type StoredAction =
  | { type: "fire"; angle: number; power: number; weapon: string }
  | { type: "use_shield" }
  | { type: "buy"; weapon?: string; accessory?: string; tankId?: string }
  | { type: "next_round" };

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
