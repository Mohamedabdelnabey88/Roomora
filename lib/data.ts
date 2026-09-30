export type RoomStatus = "available" | "occupied" | "checkout" | "request" | "cleaning" | "maintenance";
export type RoomType = "مفردة" | "غرفة وصالة" | "VIP" | "غرفتين وصالة";

export type Room = {
  id: string;
  number: string;
  floor: number;
  type: RoomType;
  status: RoomStatus;
  guest?: string;
  guestPhone?: string;
  stayId?: string;
  checkinAt?: string;
  expectedCheckoutAt?: string;
  nights?: number;
  openRequests?: number;
};

export type ApiRoom = {
  id: string;
  number: string;
  floor: number;
  room_type: RoomType;
  operational_status: "available" | "occupied" | "cleaning" | "maintenance" | "out_of_service";
  stay_id?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  checkin_at?: string | null;
  expected_checkout_at?: string | null;
  open_requests?: number | null;
};

export const fallbackRooms: Room[] = [];

export const requests: { id:string; room:string; item:string; qty:number; age:string; level:"normal"|"warning"|"critical"; status:string }[] = [];
export const notifications: { title:string; body:string; tone:"critical"|"warning"|"info" }[] = [];

function nightsBetween(checkin?: string | null, checkout?: string | null) {
  if (!checkin || !checkout) return undefined;
  const start = new Date(checkin).getTime();
  const end = new Date(checkout).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return Math.max(1, Math.ceil((end - start) / 86400000));
}

export function mapApiRoom(room: ApiRoom): Room {
  const mappedStatus: RoomStatus =
    room.operational_status === "out_of_service" ? "maintenance" : room.operational_status;

  return {
    id: room.id,
    number: room.number,
    floor: room.floor,
    type: room.room_type,
    status: mappedStatus,
    guest: room.guest_name || undefined,
    guestPhone: room.guest_phone || undefined,
    stayId: room.stay_id || undefined,
    checkinAt: room.checkin_at || undefined,
    expectedCheckoutAt: room.expected_checkout_at || undefined,
    nights: nightsBetween(room.checkin_at, room.expected_checkout_at),
    openRequests: Number(room.open_requests || 0),
    status: Number(room.open_requests || 0) > 0 && mappedStatus === "occupied" ? "request" : mappedStatus
  };
}
