"use client";

import { FormEvent, useState } from "react";
import { CheckCircle, Key, LockKey, ShieldCheck, Sparkle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

export default function RecoverAdminPanel() {
  const router = useRouter();
  const [username,setUsername] = useState("admin");
  const [password,setPassword] = useState("");
  const [setupKey,setSetupKey] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  const [done,setDone] = useState(false);

  async function submit(e:FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/setup/reset-admin",{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "x-setup-key":setupKey
      },
      body:JSON.stringify({username,password})
    });
    const payload = await response.json().catch(()=>({}));

    if (!response.ok) {
      const map:Record<string,string> = {
        forbidden:"مفتاح SETUP_KEY غير صحيح",
        setup_disabled:"SETUP_KEY غير متاح في Cloudflare Runtime",
        invalid_reset_payload:"أدخل اسم المستخدم وكلمة مرور لا تقل عن 10 أحرف",
        admin_not_found:"لا يوجد حساب Admin بهذا الاسم"
      };
      setError(map[payload.error] || ("تعذر إعادة تعيين كلمة المرور" + (payload.error ? " (" + payload.error + ")" : "")));
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
    setTimeout(()=>router.replace("/login"),1200);
  }

  return <main className="setup-shell">
    <section className="setup-card">
      <div className="login-brand">
        <div className="brand-mark"><Sparkle size={22} weight="fill"/></div>
        <div><b>Roomora</b><span>Admin Recovery</span></div>
      </div>

      <div className="login-copy">
        <span className="section-kicker">SECURE RECOVERY</span>
        <h1>استرجاع حساب الإدارة</h1>
        <p>إعادة تعيين كلمة مرور حساب Admin باستخدام SETUP_KEY المحفوظ في Cloudflare.</p>
      </div>

      {done ? <div className="setup-success"><CheckCircle size={32}/><b>تم تحديث كلمة المرور</b><span>سيتم تحويلك إلى تسجيل الدخول…</span></div> :
      <form onSubmit={submit}>
        <label className="login-field"><span>اسم المستخدم</span><div><ShieldCheck size={18}/><input value={username} onChange={e=>setUsername(e.target.value)} required/></div></label>
        <label className="login-field"><span>كلمة المرور الجديدة</span><div><LockKey size={18}/><input type="password" minLength={10} value={password} onChange={e=>setPassword(e.target.value)} required/></div></label>
        <label className="login-field"><span>SETUP_KEY</span><div><Key size={18}/><input type="password" value={setupKey} onChange={e=>setSetupKey(e.target.value)} required/></div></label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-btn login-submit" disabled={loading}>{loading?"جاري التحديث…":"إعادة تعيين كلمة المرور"}</button>
      </form>}
    </section>
  </main>;
}
