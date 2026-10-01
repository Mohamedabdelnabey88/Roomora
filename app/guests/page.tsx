import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import GuestsPanel from "@/components/GuestsPanel";
export const metadata={title:"النزلاء | Roomora"};
export default function GuestsPage(){return <AppShell><Suspense fallback={<div className="rooms-state">جاري تحميل سجل النزلاء…</div>}><GuestsPanel/></Suspense></AppShell>}
