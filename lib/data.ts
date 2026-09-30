export type RoomStatus = "available" | "occupied" | "checkout" | "request" | "cleaning" | "maintenance";
export type RoomType = "مفردة" | "غرفة وصالة" | "VIP" | "غرفتين وصالة";
export type Room = { number: string; floor: number; type: RoomType; status: RoomStatus; guest?: string; nights?: number; openRequests?: number };

const singles = ["106","112","206","212","306","312","406"];
const suite = ["G1","G2","101","102","103","104","108","109","110","111","201","202","203","204","208","209","210","211","301","302","303","304","308","309","310","311","401","402","403","404","408","409","410"];
const vip = ["107","207","307","407"];
const doubleSuite = ["105","205","305","405","411"];

function floorFor(n: string) { if (n.startsWith("G")) return 0; return Number(n[0]); }

const seedStatus: Record<string, Partial<Room>> = {
  "G1": { status: "occupied", guest: "خالد العتيبي", nights: 2, openRequests: 1 },
  "101": { status: "checkout", guest: "سعود القحطاني", nights: 3 },
  "104": { status: "request", guest: "عبدالله الشهري", nights: 1, openRequests: 2 },
  "107": { status: "occupied", guest: "ناصر الغامدي", nights: 4 },
  "201": { status: "occupied", guest: "محمد أحمد", nights: 2 },
  "207": { status: "request", guest: "فهد عسيري", nights: 2, openRequests: 1 },
  "212": { status: "cleaning" },
  "307": { status: "occupied", guest: "تركي الحربي", nights: 1 },
  "401": { status: "checkout", guest: "ماجد الزهراني", nights: 2 },
  "405": { status: "maintenance" }
};

function make(numbers: string[], type: RoomType): Room[] {
  return numbers.map((number) => ({ number, floor: floorFor(number), type, status: "available", ...seedStatus[number] } as Room));
}

export const rooms: Room[] = [...make(singles,"مفردة"), ...make(suite,"غرفة وصالة"), ...make(vip,"VIP"), ...make(doubleSuite,"غرفتين وصالة")]
  .sort((a,b) => a.floor - b.floor || a.number.localeCompare(b.number, "en", {numeric:true}));

export const requests = [
  { id:"REQ-1048", room:"104", item:"مخدة إضافية", qty:2, age:"منذ 4 دقائق", level:"normal", status:"جديد" },
  { id:"REQ-1047", room:"207", item:"بطانية", qty:1, age:"منذ 12 دقيقة", level:"warning", status:"جاري التجهيز" },
  { id:"REQ-1043", room:"G1", item:"مناشف", qty:2, age:"منذ 28 دقيقة", level:"critical", status:"متأخر" }
];

export const notifications = [
  { title:"طلب متأخر", body:"الغرفة G1 تنتظر المناشف منذ 28 دقيقة", tone:"critical" },
  { title:"الحد اليومي", body:"الغرفة 207 وصلت للحد اليومي للبطانيات", tone:"warning" },
  { title:"خروج اليوم", body:"يوجد غرفتان مقرر خروجهما في يوم الفندق الحالي", tone:"info" }
];
