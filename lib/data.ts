export type RoomStatus = "available" | "occupied" | "checkout" | "request" | "cleaning" | "maintenance";
export type RoomType = "مفردة" | "غرفة وصالة" | "VIP" | "غرفتين وصالة";
export type Room = { number: string; floor: number; type: RoomType; status: RoomStatus; guest?: string; nights?: number; openRequests?: number };

export type ApiRoom = {
  id: string;
  number: string;
  floor: number;
  room_type: RoomType;
  operational_status: "available" | "occupied" | "cleaning" | "maintenance" | "out_of_service";
};

export const fallbackRooms: Room[] = [];

export const requests: { id:string; room:string; item:string; qty:number; age:string; level:"normal"|"warning"|"critical"; status:string }[] = [];
export const notifications: { title:string; body:string; tone:"critical"|"warning"|"info" }[] = [];

export function mapApiRoom(room: ApiRoom): Room {
  const mappedStatus: RoomStatus =
    room.operational_status === "out_of_service" ? "maintenance" : room.operational_status;
  return {
    number: room.number,
    floor: room.floor,
    type: room.room_type,
    status: mappedStatus
  };
}
