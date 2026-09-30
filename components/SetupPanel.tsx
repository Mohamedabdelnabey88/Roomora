"use client";

import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Key, LockKey, ShieldCheck, Sparkle, User } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

export default function SetupPanel() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [setupRequired, setSetupRequired] = useState(true);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup/status", { cache:"no-store" })
      .then(r=>r.json())
      .then(data=>{ setSetupRequired(Boolean(data.setupRequired)); setReady(true); })
      .catch(()=>{ setError("تعذر التحقق من حالة الإعداد"); setReady(true); });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/setup/admin", {
      method:"POST",
      headers:{ "content-type":"application/json", "x-setup-key": setupKey },
      body:JSON.stringify({ name, username, password })
    });
    const payload = await response.json().catch(()=>({}));

    if (!response.ok) {
      const map: Record<string,string> = {
        forbidden:"مفتاح الإعداد غير صحيح",
        setup_disabled:"لم يتم إضافة SETUP_KEY في Cloudflare",
        setup_already_completed:"تم إنشاء حساب الإدارة بالفعل",
        invalid_setup_payload:"أدخل البيانات كاملة وكلمة مرور لا تقل عن 10 أحرف"
      };
      if (payload.error === "setup_internal_error") {
        setError(`فشل الإعداد في المرحلة: ${payload.stage || "unknown"}`);
      } else {
        setError(map[payload.error] || `تعذر إنشاء حساب الإدارة${payload.error ? ` (${payload.error})` : ""}`);
      }
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
    setTimeout(()=>router.replace("/login"), 1200);
  }

  if (!ready) return <main className="setup-shell"><div className="setup-loading">جاري التحقق من النظام…</div></main>;

  if (!setupRequired && !done) return <main className="setup-shell"><div className="setup-complete"><CheckCircle size={34}/><h1>تم إعداد Roomora</h1><p>يوجد حساب إدارة بالفعل. استخدم صفحة تسجيل الدخول.</p><button className="primary-btn" onClick={()=>router.replace("/login")}>الذهاب لتسجيل الدخول</button></div></main>;

  return <main className="setup-shell">
    <motion.section className="setup-card" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
      <div className="login-brand">
        <div className="brand-mark"><Sparkle size={22} weight="fill"/></div>
        <div><b>Roomora</b><span>Secure Initial Setup</span></div>
      </div>

      <div className="login-copy">
        <span className="section-kicker">ONE-TIME SETUP</span>
        <h1>إنشاء حساب الإدارة الأول</h1>
        <p>هذه العملية تعمل مرة واحدة فقط، وبعد إنشاء أول Admin يتم تعطيلها تلقائيًا.</p>
      </div>

      {done ? <div className="setup-success"><CheckCircle size={32}/><b>تم إنشاء حساب الإدارة</b><span>سيتم تحويلك إلى تسجيل الدخول…</span></div> :
      <form onSubmit={submit}>
        <label className="login-field"><span>اسم المدير</span><div><User size={18}/><input value={name} onChange={e=>setName(e.target.value)} placeholder="اسم المدير" required/></div></label>
        <label className="login-field"><span>اسم المستخدم</span><div><ShieldCheck size={18}/><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="admin" required/></div></label>
        <label className="login-field"><span>كلمة المرور</span><div><LockKey size={18}/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="10 أحرف على الأقل" minLength={10} required/></div></label>
        <label className="login-field"><span>مفتاح الإعداد SETUP_KEY</span><div><Key size={18}/><input type="password" value={setupKey} onChange={e=>setSetupKey(e.target.value)} placeholder="المفتاح الموجود في Cloudflare" required/></div></label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-btn login-submit" disabled={loading}>{loading?"جاري الإنشاء…":"إنشاء حساب الإدارة"}</button>
      </form>}
    </motion.section>
  </main>;
}
