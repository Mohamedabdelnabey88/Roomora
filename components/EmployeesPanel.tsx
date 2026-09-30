"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, ShieldCheck, UserCircle, Users } from "@phosphor-icons/react";

type Employee = {
  id:string;
  name:string;
  username:string;
  role:"admin"|"reception";
  active:number;
  created_at:string;
};

export default function EmployeesPanel() {
  const [users,setUsers] = useState<Employee[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [form,setForm] = useState({name:"",username:"",password:"",role:"reception" as "admin"|"reception"});
  const [saving,setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/users",{cache:"no-store"});
    if (response.status === 401) { window.location.href="/login"; return; }
    const payload = await response.json();
    if (!response.ok) { setError(payload.error === "forbidden" ? "هذه الصفحة متاحة للإدارة فقط" : "تعذر تحميل الموظفين"); setLoading(false); return; }
    setUsers(payload);
    setLoading(false);
  }

  useEffect(()=>{ void load(); },[]);

  async function createUser(e:FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const response = await fetch("/api/admin/users",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(form)
    });
    const payload = await response.json();
    if (!response.ok) {
      const map:Record<string,string> = {
        username_exists:"اسم المستخدم مستخدم بالفعل",
        invalid_user_payload:"أدخل الاسم واسم المستخدم وكلمة مرور لا تقل عن 10 أحرف",
        forbidden:"ليس لديك صلاحية إدارة الموظفين"
      };
      setError(map[payload.error] || "تعذر إنشاء الحساب");
      setSaving(false);
      return;
    }
    setForm({name:"",username:"",password:"",role:"reception"});
    setSaving(false);
    await load();
  }

  async function toggle(user:Employee) {
    const response = await fetch(`/api/admin/users/${user.id}`,{
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({active:!Boolean(user.active)})
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error === "cannot_disable_self" ? "لا يمكن للإدمن تعطيل حسابه الحالي" : "تعذر تحديث الحساب");
      return;
    }
    await load();
  }

  return <main className="settings-page">
    <header className="settings-header">
      <div>
        <Link href="/" className="back-link"><ArrowRight size={16}/> العودة للوحة التشغيل</Link>
        <span className="section-kicker">TEAM & ACCESS</span>
        <h1>الموظفون والصلاحيات</h1>
        <p>إنشاء حسابات موظفي الاستقبال وإدارة حالة الوصول للنظام.</p>
      </div>
    </header>

    <div className="employees-layout">
      <section className="panel settings-card">
        <div className="settings-title"><div className="settings-icon"><Plus size={20}/></div><div><h2>إضافة موظف</h2><p>كلمة المرور لا تقل عن 10 أحرف.</p></div></div>
        <form onSubmit={createUser}>
          <label className="login-field"><span>اسم الموظف</span><div><UserCircle size={18}/><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></div></label>
          <label className="login-field"><span>اسم المستخدم</span><div><Users size={18}/><input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} required/></div></label>
          <label className="login-field"><span>كلمة المرور المؤقتة</span><div><ShieldCheck size={18}/><input type="password" minLength={10} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/></div></label>
          <label className="login-field"><span>الدور</span><div><ShieldCheck size={18}/><select value={form.role} onChange={e=>setForm({...form,role:e.target.value as "admin"|"reception"})}><option value="reception">موظف استقبال</option><option value="admin">مدير</option></select></div></label>
          {error && <div className="login-error">{error}</div>}
          <button className="primary-btn full" disabled={saving}>{saving?"جاري الإنشاء…":"إنشاء الحساب"}</button>
        </form>
      </section>

      <section className="panel limits-card">
        <div className="settings-title"><div className="settings-icon"><Users size={20}/></div><div><h2>الحسابات الحالية</h2><p>التعطيل يمنع تسجيل الدخول فورًا بدون حذف السجل.</p></div></div>
        {loading ? <div className="rooms-state">جاري تحميل الحسابات…</div> :
          <div className="employee-list">{users.map(user=><div className="employee-row" key={user.id}>
            <div className="avatar">{user.name.slice(0,1)}</div>
            <div className="employee-main"><b>{user.name}</b><span>@{user.username}</span></div>
            <span className={`role-chip ${user.role}`}>{user.role==="admin"?"مدير":"استقبال"}</span>
            <button className={`status-btn ${user.active?"active":"inactive"}`} onClick={()=>toggle(user)}>{user.active?"نشط":"معطل"}</button>
          </div>)}</div>}
      </section>
    </div>
  </main>;
}
