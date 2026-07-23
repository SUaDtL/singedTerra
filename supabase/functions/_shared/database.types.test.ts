import type {
  Database,
  RoomReapTrim,
  RoomRow,
  ServiceClient,
  StoredAction,
  StoredOptions,
  StoredPlayer,
  StoredScoreEntry,
} from "./mod.ts";

type Equal<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends
    (<Value>() => Value extends Expected ? 1 : 2)
    ? (<Value>() => Value extends Expected ? 1 : 2) extends
      (<Value>() => Value extends Actual ? 1 : 2) ? true
    : false
    : false;
type IsAny<Value> = 0 extends (1 & Value) ? true : false;
type AssertFalse<Value extends false> = Value;
type AssertTrue<Value extends true> = Value;
type AssertExact<Actual, Expected> = Equal<Actual, Expected>;
type AssertAll<Values extends Record<string, true>> = Values;
type RequiredKeys<Value> = {
  [Key in keyof Value]-?: {} extends Pick<Value, Key> ? never : Key;
}[keyof Value];

type ExpectedStoredPlayer = {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  lastSeen?: number;
  ai?: "easy" | "medium" | "hard";
};
type ExpectedStoredOptions = {
  maxPlayers: number;
  maxWind: number;
  gravity: number;
  visibility?: "public" | "private";
  rounds?: number;
  armsLevel?: number;
  interestRate?: number;
  suddenDeathTurn?: number;
};
type ExpectedStoredAction =
  | { type: "fire"; angle: number; power: number; weapon: string }
  | { type: "use_shield" }
  | { type: "buy"; weapon?: string; accessory?: string; tankId?: string }
  | { type: "next_round" };
type ExpectedStoredScoreEntry = {
  tankId: string;
  playerName: string;
  roundWins: number;
  kills: number;
  totalDamage: number;
};
type ExpectedRoomReapTrim = {
  id: string;
  players: ExpectedStoredPlayer[];
};

type ExpectedRoomsRow = {
  id: string;
  code: string;
  seed: number;
  status: "waiting" | "active" | "finished";
  options: ExpectedStoredOptions;
  players: ExpectedStoredPlayer[];
  active_player_index: number;
  turn: number;
  winner: string | null;
  created_at: string;
  rematch_room_id: string | null;
};
type ExpectedRoomsInsert = {
  id?: string;
  code: string;
  seed: number;
  status?: "waiting" | "active" | "finished";
  options?: ExpectedStoredOptions;
  players?: ExpectedStoredPlayer[];
  active_player_index?: number;
  turn?: number;
  winner?: string | null;
  created_at?: string;
  rematch_room_id?: string | null;
};
type ExpectedRoomsUpdate = Partial<ExpectedRoomsRow>;
type ExpectedRoomActionsRow = {
  id: string;
  room_id: string;
  seq: number;
  player_id: string;
  action: ExpectedStoredAction;
  created_at: string;
};
type ExpectedRoomActionsInsert = {
  id?: string;
  room_id: string;
  seq: number;
  player_id: string;
  action: ExpectedStoredAction;
  created_at?: string;
};
type ExpectedRoomActionsUpdate = Partial<ExpectedRoomActionsRow>;
type ExpectedMatchScoresRow = {
  id: string;
  room_id: string;
  winner: string | null;
  rounds: number;
  scoreboard: ExpectedStoredScoreEntry[];
  created_at: string;
};
type ExpectedMatchScoresInsert = {
  id?: string;
  room_id: string;
  winner?: string | null;
  rounds: number;
  scoreboard: ExpectedStoredScoreEntry[];
  created_at?: string;
};
type ExpectedMatchScoresUpdate = Partial<ExpectedMatchScoresRow>;
type ExpectedRateLimitsRow = {
  bucket: string;
  window_start: number;
  count: number;
};
type ExpectedRateLimitsInsert = {
  bucket: string;
  window_start: number;
  count?: number;
};
type ExpectedRateLimitsUpdate = Partial<ExpectedRateLimitsRow>;
type ExpectedRoomSeatsRow = {
  room_id: string;
  seat_id: string;
  token: string;
  created_at: string;
};
type ExpectedRoomSeatsInsert = {
  room_id: string;
  seat_id: string;
  token: string;
  created_at?: string;
};
type ExpectedRoomSeatsUpdate = Partial<ExpectedRoomSeatsRow>;

type PublicSchema = Database["public"];
type Tables = PublicSchema["Tables"];
type Functions = PublicSchema["Functions"];
type Rooms = Tables["rooms"];
type RoomsRow = Rooms["Row"];
type RoomsInsert = Rooms["Insert"];
type RoomsUpdate = Rooms["Update"];
type Relationship<TableName extends keyof Tables> =
  Tables[TableName]["Relationships"][number];

type _ServiceClientMustNotBeAny = AssertFalse<IsAny<ServiceClient>>;
type _TableKeysAreExact = AssertExact<
  keyof Tables,
  "rooms" | "room_actions" | "match_scores" | "rate_limits" | "room_seats"
>;
type _RpcKeysAreExact = AssertExact<
  keyof Functions,
  "apply_room_reap" | "bump_rate_limit" | "submit_room_action"
>;
type _ViewKeysAreExact = AssertExact<keyof PublicSchema["Views"], never>;
type _EnumKeysAreExact = AssertExact<keyof PublicSchema["Enums"], never>;
type _CompositeTypeKeysAreExact = AssertExact<
  keyof PublicSchema["CompositeTypes"],
  never
>;

type _StoredPlayerIsExact = AssertExact<StoredPlayer, ExpectedStoredPlayer>;
type _StoredOptionsAreExact = AssertExact<StoredOptions, ExpectedStoredOptions>;
type _StoredActionIsExact = AssertExact<StoredAction, ExpectedStoredAction>;
type _StoredScoreEntryIsExact = AssertExact<
  StoredScoreEntry,
  ExpectedStoredScoreEntry
>;
type _RoomReapTrimIsExact = AssertExact<RoomReapTrim, ExpectedRoomReapTrim>;

type _ApplyRoomReapArgsAreExact = AssertExact<
  Functions["apply_room_reap"]["Args"],
  { p_dead: string[]; p_trims: ExpectedRoomReapTrim[] }
>;
type _ApplyRoomReapReturnsAreExact = AssertExact<
  Functions["apply_room_reap"]["Returns"],
  undefined
>;
type _BumpRateLimitArgsAreExact = AssertExact<
  Functions["bump_rate_limit"]["Args"],
  { p_bucket: string; p_window: number }
>;
type _BumpRateLimitReturnsAreExact = AssertExact<
  Functions["bump_rate_limit"]["Returns"],
  number
>;
type _SubmitRoomActionArgsAreExact = AssertExact<
  Functions["submit_room_action"]["Args"],
  {
    p_room_id: string;
    p_player_id: string;
    p_action: ExpectedStoredAction;
    p_ends_turn: boolean;
    p_next_index: number;
    p_next_turn: number;
  }
>;
type _SubmitRoomActionReturnsAreExact = AssertExact<
  Functions["submit_room_action"]["Returns"],
  number
>;

type _RoomsRowKeysAreExact = AssertExact<
  keyof RoomsRow,
  | "id"
  | "code"
  | "seed"
  | "status"
  | "options"
  | "players"
  | "active_player_index"
  | "turn"
  | "winner"
  | "created_at"
  | "rematch_room_id"
>;
type _RoomsRowValuesAreExact = AssertExact<
  RoomsRow,
  ExpectedRoomsRow
>;
type _RoomsInsertIsExact = AssertExact<RoomsInsert, ExpectedRoomsInsert>;
type _RoomsUpdateIsExact = AssertExact<RoomsUpdate, ExpectedRoomsUpdate>;
type _RoomActionsRowIsExact = AssertExact<
  Tables["room_actions"]["Row"],
  ExpectedRoomActionsRow
>;
type _RoomActionsInsertIsExact = AssertExact<
  Tables["room_actions"]["Insert"],
  ExpectedRoomActionsInsert
>;
type _RoomActionsUpdateIsExact = AssertExact<
  Tables["room_actions"]["Update"],
  ExpectedRoomActionsUpdate
>;
type _MatchScoresRowIsExact = AssertExact<
  Tables["match_scores"]["Row"],
  ExpectedMatchScoresRow
>;
type _MatchScoresInsertIsExact = AssertExact<
  Tables["match_scores"]["Insert"],
  ExpectedMatchScoresInsert
>;
type _MatchScoresUpdateIsExact = AssertExact<
  Tables["match_scores"]["Update"],
  ExpectedMatchScoresUpdate
>;
type _RateLimitsRowIsExact = AssertExact<
  Tables["rate_limits"]["Row"],
  ExpectedRateLimitsRow
>;
type _RateLimitsInsertIsExact = AssertExact<
  Tables["rate_limits"]["Insert"],
  ExpectedRateLimitsInsert
>;
type _RateLimitsUpdateIsExact = AssertExact<
  Tables["rate_limits"]["Update"],
  ExpectedRateLimitsUpdate
>;
type _RoomSeatsRowIsExact = AssertExact<
  Tables["room_seats"]["Row"],
  ExpectedRoomSeatsRow
>;
type _RoomSeatsInsertIsExact = AssertExact<
  Tables["room_seats"]["Insert"],
  ExpectedRoomSeatsInsert
>;
type _RoomSeatsUpdateIsExact = AssertExact<
  Tables["room_seats"]["Update"],
  ExpectedRoomSeatsUpdate
>;
type _RoomsInsertRequiredKeysAreExact = AssertExact<
  RequiredKeys<RoomsInsert>,
  "code" | "seed"
>;
type _RoomsUpdateRequiredKeysAreExact = AssertExact<
  RequiredKeys<RoomsUpdate>,
  never
>;
type _RoomsRowStatusIsRequired = AssertFalse<
  {} extends Pick<RoomsRow, "status"> ? true : false
>;
type _RoomsInsertCodeIsRequired = AssertFalse<
  {} extends Pick<RoomsInsert, "code"> ? true : false
>;
type _RoomsInsertSeedIsRequired = AssertFalse<
  {} extends Pick<RoomsInsert, "seed"> ? true : false
>;
type _RoomsInsertRequiredValueTypesAreExact = AssertExact<
  Pick<RoomsInsert, "code" | "seed">,
  { code: string; seed: number }
>;
type _RoomsWinnerIsExactlyNullableString = AssertExact<
  RoomsRow["winner"],
  string | null
>;
type _RoomsRematchRoomIdIsExactlyNullableString = AssertExact<
  RoomsRow["rematch_room_id"],
  string | null
>;

type _RoomsOptionsMustNotBeAny = AssertFalse<IsAny<RoomsRow["options"]>>;
type _RoomsPlayersMustNotBeAny = AssertFalse<IsAny<RoomsRow["players"]>>;
type _RoomsPlayerElementMustNotBeAny = AssertFalse<
  IsAny<RoomsRow["players"][number]>
>;
type _RoomActionsActionMustNotBeAny = AssertFalse<
  IsAny<Tables["room_actions"]["Row"]["action"]>
>;
type _MatchScoresScoreboardMustNotBeAny = AssertFalse<
  IsAny<Tables["match_scores"]["Row"]["scoreboard"]>
>;
type _MatchScoresScoreboardElementMustNotBeAny = AssertFalse<
  IsAny<Tables["match_scores"]["Row"]["scoreboard"][number]>
>;
type _RoomReapTrimsMustNotBeAny = AssertFalse<
  IsAny<Functions["apply_room_reap"]["Args"]["p_trims"]>
>;
type _RoomReapTrimElementMustNotBeAny = AssertFalse<
  IsAny<Functions["apply_room_reap"]["Args"]["p_trims"][number]>
>;
type _RoomsOptionsAreExact = AssertExact<
  RoomsRow["options"],
  ExpectedStoredOptions
>;
type _RoomsPlayersAreExact = AssertExact<
  RoomsRow["players"],
  ExpectedStoredPlayer[]
>;
type _RoomActionsActionIsExact = AssertExact<
  Tables["room_actions"]["Row"]["action"],
  ExpectedStoredAction
>;
type _MatchScoresScoreboardIsExact = AssertExact<
  Tables["match_scores"]["Row"]["scoreboard"],
  ExpectedStoredScoreEntry[]
>;
type _RoomReapTrimsAreExact = AssertExact<
  Functions["apply_room_reap"]["Args"]["p_trims"],
  ExpectedRoomReapTrim[]
>;

type _RoomsRelationshipIsExact = AssertExact<
  Relationship<"rooms">,
  {
    foreignKeyName: "rooms_rematch_room_id_fkey";
    columns: ["rematch_room_id"];
    referencedRelation: "rooms";
    referencedColumns: ["id"];
    isOneToOne: false;
  }
>;
type _RoomActionsRelationshipIsExact = AssertExact<
  Relationship<"room_actions">,
  {
    foreignKeyName: "room_actions_room_id_fkey";
    columns: ["room_id"];
    referencedRelation: "rooms";
    referencedColumns: ["id"];
    isOneToOne: false;
  }
>;
type _MatchScoresRelationshipIsExact = AssertExact<
  Relationship<"match_scores">,
  {
    foreignKeyName: "match_scores_room_id_fkey";
    columns: ["room_id"];
    referencedRelation: "rooms";
    referencedColumns: ["id"];
    isOneToOne: true;
  }
>;
type _RoomSeatsRelationshipIsExact = AssertExact<
  Relationship<"room_seats">,
  {
    foreignKeyName: "room_seats_room_id_fkey";
    columns: ["room_id"];
    referencedRelation: "rooms";
    referencedColumns: ["id"];
    isOneToOne: false;
  }
>;
type _RoomsRelationshipMustMatchEveryLiteral = AssertTrue<
  _RoomsRelationshipIsExact
>;
type _RoomActionsRelationshipMustMatchEveryLiteral = AssertTrue<
  _RoomActionsRelationshipIsExact
>;
type _MatchScoresRelationshipMustMatchEveryLiteral = AssertTrue<
  _MatchScoresRelationshipIsExact
>;
type _RoomSeatsRelationshipMustMatchEveryLiteral = AssertTrue<
  _RoomSeatsRelationshipIsExact
>;

type _AllExactContracts = AssertAll<{
  tableKeys: _TableKeysAreExact;
  rpcKeys: _RpcKeysAreExact;
  viewKeys: _ViewKeysAreExact;
  enumKeys: _EnumKeysAreExact;
  compositeTypeKeys: _CompositeTypeKeysAreExact;
  storedPlayer: _StoredPlayerIsExact;
  storedOptions: _StoredOptionsAreExact;
  storedAction: _StoredActionIsExact;
  storedScoreEntry: _StoredScoreEntryIsExact;
  roomReapTrim: _RoomReapTrimIsExact;
  applyRoomReapArgs: _ApplyRoomReapArgsAreExact;
  applyRoomReapReturns: _ApplyRoomReapReturnsAreExact;
  bumpRateLimitArgs: _BumpRateLimitArgsAreExact;
  bumpRateLimitReturns: _BumpRateLimitReturnsAreExact;
  submitRoomActionArgs: _SubmitRoomActionArgsAreExact;
  submitRoomActionReturns: _SubmitRoomActionReturnsAreExact;
  roomsRowKeys: _RoomsRowKeysAreExact;
  roomsRowValues: _RoomsRowValuesAreExact;
  roomsInsert: _RoomsInsertIsExact;
  roomsUpdate: _RoomsUpdateIsExact;
  roomActionsRow: _RoomActionsRowIsExact;
  roomActionsInsert: _RoomActionsInsertIsExact;
  roomActionsUpdate: _RoomActionsUpdateIsExact;
  matchScoresRow: _MatchScoresRowIsExact;
  matchScoresInsert: _MatchScoresInsertIsExact;
  matchScoresUpdate: _MatchScoresUpdateIsExact;
  rateLimitsRow: _RateLimitsRowIsExact;
  rateLimitsInsert: _RateLimitsInsertIsExact;
  rateLimitsUpdate: _RateLimitsUpdateIsExact;
  roomSeatsRow: _RoomSeatsRowIsExact;
  roomSeatsInsert: _RoomSeatsInsertIsExact;
  roomSeatsUpdate: _RoomSeatsUpdateIsExact;
  roomsInsertRequiredKeys: _RoomsInsertRequiredKeysAreExact;
  roomsUpdateRequiredKeys: _RoomsUpdateRequiredKeysAreExact;
  roomsInsertRequiredValueTypes: _RoomsInsertRequiredValueTypesAreExact;
  roomsWinner: _RoomsWinnerIsExactlyNullableString;
  roomsRematchRoomId: _RoomsRematchRoomIdIsExactlyNullableString;
  roomsOptions: _RoomsOptionsAreExact;
  roomsPlayers: _RoomsPlayersAreExact;
  roomActionsAction: _RoomActionsActionIsExact;
  matchScoresScoreboard: _MatchScoresScoreboardIsExact;
  roomReapTrims: _RoomReapTrimsAreExact;
  roomsRelationship: _RoomsRelationshipIsExact;
  roomActionsRelationship: _RoomActionsRelationshipIsExact;
  matchScoresRelationship: _MatchScoresRelationshipIsExact;
  roomSeatsRelationship: _RoomSeatsRelationshipIsExact;
}>;

function invalidDatabaseContractsAreRejected(client: ServiceClient): void {
  // @ts-expect-error The migration contract is a closed table-name set.
  client.from("missing_table");
  // @ts-expect-error The migration contract is a closed RPC-name set.
  client.rpc("missing_rpc");
  // @ts-expect-error RPC calls must supply the complete typed argument object.
  client.rpc("bump_rate_limit", { p_bucket: "room:127.0.0.1" });
  // @ts-expect-error rooms inserts require both non-default database columns.
  client.from("rooms").insert({ code: "ABCD" });
  // @ts-expect-error rooms updates retain typed column values.
  client.from("rooms").update({ turn: "not-a-number" });
}

function invalidRoomPropertiesAreRejected(room: RoomRow): void {
  // @ts-expect-error Room rows expose only migration-backed columns.
  void room.missing_column;
}

function invalidRoomsSelectCannotBeConsumed(client: ServiceClient): void {
  const invalidSelect = client.from("rooms").select("missing_column");
  const validSelect = client.from("rooms").select("id");
  type InvalidSelectData = Awaited<typeof invalidSelect>["data"];
  type ValidSelectData = Awaited<typeof validSelect>["data"];
  type _InvalidSelectResultIsExactlyErrorShaped = AssertTrue<
    Equal<
      InvalidSelectData,
      | (
        & { error: true }
        & "column 'missing_column' does not exist on 'rooms'."
      )[]
      | null
    >
  >;
  // @ts-expect-error An invalid selected column cannot masquerade as a valid result.
  const invalidAsValid: ValidSelectData = null as unknown as InvalidSelectData;
  void invalidAsValid;
}

void invalidDatabaseContractsAreRejected;
void invalidRoomPropertiesAreRejected;
void invalidRoomsSelectCannotBeConsumed;

const options: StoredOptions = {
  maxPlayers: 3,
  maxWind: 7,
  gravity: 0.2,
  visibility: "public",
  rounds: 3,
  armsLevel: 2,
  interestRate: 0.15,
  suddenDeathTurn: 12,
};

const players: StoredPlayer[] = [
  {
    id: "human-1",
    name: "Alice",
    color: "#e84d4d",
    ready: true,
    lastSeen: 100,
  },
  {
    id: "bot-1",
    name: "CPU",
    color: "#4d8ce8",
    ready: true,
    lastSeen: 100,
    ai: "medium",
  },
];

const fullRoom: RoomRow = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "ABCD",
  seed: 42,
  status: "waiting",
  options,
  players,
  active_player_index: 0,
  turn: 0,
  winner: null,
  created_at: "2026-07-22T00:00:00.000Z",
  rematch_room_id: null,
};

Deno.test("Database exposes the complete current rooms row", () => {
  if (
    fullRoom.active_player_index !== 0 ||
    fullRoom.rematch_room_id !== null
  ) {
    throw new Error("rooms contract mismatch");
  }
});
