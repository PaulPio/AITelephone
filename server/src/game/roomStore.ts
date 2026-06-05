import type { Redis } from "@upstash/redis";
import type { Room } from "@gartic-ai/shared";

export interface RoomStore {
  get(code: string): Promise<Room | undefined>;
  save(room: Room): Promise<void>;
  update(code: string, updater: (room: Room) => Room | Promise<Room>): Promise<Room>;
}

const cloneRoom = (room: Room): Room => JSON.parse(JSON.stringify(room)) as Room;

export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();

  async get(code: string): Promise<Room | undefined> {
    const room = this.rooms.get(code.toUpperCase());
    return room ? cloneRoom(room) : undefined;
  }

  async save(room: Room): Promise<void> {
    this.rooms.set(room.code.toUpperCase(), cloneRoom(room));
  }

  async update(code: string, updater: (room: Room) => Room | Promise<Room>): Promise<Room> {
    const current = await this.get(code);
    if (!current) {
      throw new Error(`Room ${code} not found`);
    }
    const updated = await updater(current);
    updated.updatedAt = new Date().toISOString();
    await this.save(updated);
    return cloneRoom(updated);
  }
}

export class RedisRoomStore implements RoomStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number
  ) {}

  async get(code: string): Promise<Room | undefined> {
    const room = await this.redis.get<Room>(this.key(code));
    return room ?? undefined;
  }

  async save(room: Room): Promise<void> {
    await this.redis.set(this.key(room.code), room, { ex: this.ttlSeconds });
  }

  async update(code: string, updater: (room: Room) => Room | Promise<Room>): Promise<Room> {
    const current = await this.get(code);
    if (!current) {
      throw new Error(`Room ${code} not found`);
    }
    const updated = await updater(current);
    updated.updatedAt = new Date().toISOString();
    await this.save(updated);
    return updated;
  }

  private key(code: string): string {
    return `room:${code.toUpperCase()}`;
  }
}
