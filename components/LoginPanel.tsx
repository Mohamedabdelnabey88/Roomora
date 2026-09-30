"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeSlash, LockKey, Sparkle, User } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

export default function LoginPanel() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error === "invalid_credentials" ? "اسم المستخدم أو كلمة المرور غير صحيحة" : "تعذر تسجيل الدخول");
      const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
      router.replace(next || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-shell">
    <motion.section className="login-card" initial={{opacity:0,y:14,scale:.985}} animate={{opacity:1,y:0,scale:1}} transition={{duration:.35}}>
      <div className="login-brand">
        <div className="brand-mark"><Sparkle size={22} weight="fill"/></div>
        <div><b>Roomora</b><span>Hotel Operations</span></div>
      </div>

      <div className="login-copy">
        <span className="section-kicker">SECURE ACCESS</span>
        <h1>تسجيل الدخول</h1>
        <p>دخول موظفي الاستقبال والإدارة إلى نظام تشغيل الفندق.</p>
      </div>

      <form onSubmit={submit}>
        <label className="login-field">
          <span>اسم المستخدم</span>
          <div><User size={18}/><input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="مثال: reception1" required/></div>
        </label>

        <label className="login-field">
          <span>كلمة المرور</span>
          <div><LockKey size={18}/><input type={show?"text":"password"} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/><button type="button" onClick={()=>setShow(v=>!v)} aria-label="إظهار كلمة المرور">{show?<EyeSlash size={18}/>:<Eye size={18}/>}</button></div>
        </label>

        {error && <div className="login-error">{error}</div>}
        <button className="primary-btn login-submit" disabled={loading}>{loading?"جاري التحقق…":"دخول آمن"}</button>
      </form>

      <div className="login-foot"><LockKey size={14}/> الجلسات مشفرة ومحددة المدة</div>
    </motion.section>

    <section className="login-visual">
      <div className="login-orb one"/>
      <div className="login-orb two"/>
      <div className="visual-copy"><span>ROOMORA</span><h2>تشغيل الفندق<br/>بهدوء ودقة.</h2><p>الغرف، الطلبات، الورديات، والتنبيهات في مساحة تشغيل واحدة.</p></div>
    </section>
  </main>;
}
