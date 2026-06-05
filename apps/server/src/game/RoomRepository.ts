import {
  DEFAULT_CONFIG,
  type ChainSnapshot,
  type LinkSnapshot,
  type PlayerSnapshot,
  type RoomConfig,
  type RoomSnapshot,
} from "@drift/shared";
import { supabase } from "../lib/supabase.js";
import { generateRoomCode } from "../lib/roomCode.js";

type DbRoom = {
  id: string;
  code: string;
  host_player_id: string | null;
  state: string;
  round: number;
  max_players: number;
  min_players: number;
  config: RoomConfig;
  reveal_chain_index: number;
};

export class RoomRepository {
  async createRoom(
    authUserId: string,
    hostName: string,
    minPlayers = 3,
    maxPlayers = 16
  ): Promise<{ room: RoomSnapshot; playerId: string }> {
    const min = Math.min(8, Math.max(3, minPlayers));
    const code = await this.uniqueCode();
    const { data: roomRow, error: roomErr } = await supabase
      .from("rooms")
      .insert({
        code,
        state: "LOBBY",
        round: 0,
        max_players: maxPlayers,
        min_players: min,
        config: DEFAULT_CONFIG,
        reveal_chain_index: 0,
      })
      .select()
      .single();

    if (roomErr || !roomRow) throw new Error(roomErr?.message ?? "Room create failed");

    const { data: playerRow, error: playerErr } = await supabase
      .from("players")
      .insert({
        room_id: roomRow.id,
        auth_user_id: authUserId,
        name: hostName,
        display_index: 0,
        connected: true,
      })
      .select()
      .single();

    if (playerErr || !playerRow) throw new Error(playerErr?.message ?? "Player create failed");

    await supabase
      .from("rooms")
      .update({ host_player_id: playerRow.id })
      .eq("id", roomRow.id);

    const room = await this.loadRoom(roomRow.id);
    return { room, playerId: playerRow.id };
  }

  async joinRoom(
    code: string,
    authUserId: string,
    name: string
  ): Promise<{ room: RoomSnapshot; playerId: string; isHost: boolean }> {
    const { data: roomRow, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (error || !roomRow) throw new Error("Room not found");

    const { data: existing } = await supabase
      .from("players")
      .select("id")
      .eq("room_id", roomRow.id)
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (roomRow.state !== "LOBBY" && !existing) {
      throw new Error("Game already started");
    }

    const { count } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomRow.id);

    if (!existing && (count ?? 0) >= roomRow.max_players) {
      throw new Error("Room is full");
    }

    if (existing) {
      await supabase
        .from("players")
        .update({ name, connected: true, last_seen_at: new Date().toISOString() })
        .eq("id", existing.id);
      const room = await this.loadRoom(roomRow.id);
      return {
        room,
        playerId: existing.id,
        isHost: room.hostPlayerId === existing.id,
      };
    }

    const displayIndex = count ?? 0;
    const { data: playerRow, error: playerErr } = await supabase
      .from("players")
      .insert({
        room_id: roomRow.id,
        auth_user_id: authUserId,
        name,
        display_index: displayIndex,
        connected: true,
      })
      .select()
      .single();

    if (playerErr || !playerRow) throw new Error(playerErr?.message ?? "Join failed");

    const room = await this.loadRoom(roomRow.id);
    return {
      room,
      playerId: playerRow.id,
      isHost: room.hostPlayerId === playerRow.id,
    };
  }

  async updateRoomState(
    roomId: string,
    patch: Partial<{
      state: string;
      round: number;
      config: RoomConfig;
      reveal_chain_index: number;
    }>
  ): Promise<void> {
    const { error } = await supabase.from("rooms").update(patch).eq("id", roomId);
    if (error) throw new Error(error.message);
  }

  async setPlayerSubmitted(roomId: string, playerId: string, submitted: boolean): Promise<void> {
    await supabase
      .from("players")
      .update({ submitted, last_seen_at: new Date().toISOString() })
      .eq("id", playerId)
      .eq("room_id", roomId);
  }

  async resetSubmissions(roomId: string): Promise<void> {
    await supabase.from("players").update({ submitted: false }).eq("room_id", roomId);
  }

  async setPlayerSocket(playerId: string, socketId: string | null): Promise<void> {
    await supabase
      .from("players")
      .update({ socket_id: socketId, connected: !!socketId })
      .eq("id", playerId);
  }

  async createChains(roomId: string, seedWords: string[]): Promise<void> {
    const rows = seedWords.map((seed_word, chain_index) => ({
      room_id: roomId,
      chain_index,
      seed_word,
    }));
    const { data, error } = await supabase.from("chains").insert(rows).select();
    if (error || !data) throw new Error(error?.message ?? "Chain create failed");

    for (const chain of data) {
      const seed = seedWords[chain.chain_index];
      await supabase.from("links").insert({
        chain_id: chain.id,
        round: 0,
        type: "word",
        author_player_id: null,
        content: seed,
      });
    }
  }

  async addLink(
    chainId: string,
    round: number,
    type: "drawing" | "image",
    authorPlayerId: string | null,
    content: string
  ): Promise<LinkSnapshot> {
    const { data, error } = await supabase
      .from("links")
      .insert({
        chain_id: chainId,
        round,
        type,
        author_player_id: authorPlayerId,
        content,
      })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message ?? "Link create failed");

    return {
      id: data.id,
      type: data.type as LinkSnapshot["type"],
      authorId: data.author_player_id,
      content: data.content,
      round: data.round,
      createdAt: data.created_at,
    };
  }

  async loadRoom(roomId: string): Promise<RoomSnapshot> {
    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (error || !room) throw new Error("Room not found");

    const { data: players } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("display_index");

    const { data: chains } = await supabase
      .from("chains")
      .select("*")
      .eq("room_id", roomId)
      .order("chain_index");

    const chainIds = (chains ?? []).map((c) => c.id);
    const { data: links } =
      chainIds.length > 0
        ? await supabase.from("links").select("*").in("chain_id", chainIds).order("created_at")
        : { data: [] };

    const playerMap = new Map((players ?? []).map((p) => [p.id, p.name]));

    const chainSnapshots: ChainSnapshot[] = (chains ?? []).map((c) => ({
      id: c.id,
      chainIndex: c.chain_index,
      seedWord: c.seed_word,
      links: (links ?? [])
        .filter((l) => l.chain_id === c.id)
        .map((l) => ({
          id: l.id,
          type: l.type as LinkSnapshot["type"],
          authorId: l.author_player_id,
          authorName: l.author_player_id
            ? playerMap.get(l.author_player_id)
            : undefined,
          content: l.content,
          round: l.round,
          createdAt: l.created_at,
        })),
    }));

    const r = room as DbRoom;

    return {
      id: r.id,
      code: r.code,
      hostPlayerId: r.host_player_id,
      state: r.state as RoomSnapshot["state"],
      round: r.round,
      maxPlayers: r.max_players,
      minPlayers: r.min_players,
      config: r.config as RoomConfig,
      players: (players ?? []).map(
        (p): PlayerSnapshot => ({
          id: p.id,
          name: p.name,
          displayIndex: p.display_index ?? 0,
          connected: p.connected,
          submitted: p.submitted,
          isHost: p.id === r.host_player_id,
        })
      ),
      chains: chainSnapshots,
      revealChainIndex: r.reveal_chain_index,
      deadline: null,
    };
  }

  async loadRoomByCode(code: string): Promise<RoomSnapshot | null> {
    const { data } = await supabase
      .from("rooms")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (!data) return null;
    return this.loadRoom(data.id);
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateRoomCode();
      const { data } = await supabase
        .from("rooms")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!data) return code;
    }
    throw new Error("Could not generate room code");
  }
}
