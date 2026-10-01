"use client";

import { FormEvent,useEffect,useState } from "react";
import { Eye,EyeSlash,Plus,ShieldCheck,UserCircle,Users } from "@phosphor-icons/react";
import RoleMatrix from "@/components/ui/RoleMatrix";
import { roleMeta } from "@/lib/roles";

type Employee={id:string;name:string;username:string;role:"admin"|"reception";active:number;created_at:string};

export default function EmployeesPanel(){
  const [users,setUsers]=useState<Employee[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [form,setForm]=useState({name:"",username:"",password:"",role:"reception" as "admin"|"reception"});
  const [saving,setSaving]=useState(false);
  const [showPassword,setShowPassword]=useState(false);

  async function load(){
    setLoading(true);
    const response=await fetch("/api/admin/users",{cache:"no-store"});
    if(response.status===401){window.location.href="/login";return}
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!Array.isArray(payload)){setError(payload?.error==="forbidden"?"هذه الصفحة متاحة للإدارة فقط":"تعذر تحميل الموظفين");setLoading(false);return}
    setUsers(payload);setError("");setLoading(false);
  }
  useEffect(()=>{void load()},[]);

  async function createUser(e:FormEvent){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    const response=await fetch("/api/admin/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const map:Record<string,string>={username_exists:"اسم المستخدم مستخدم بالفعل",invalid_user_payload:"أدخل الاسم واسم المستخدم وكلمة مرور لا تقل عن 10 أحرف",forbidden:"ليس لديك صلاحية إدارة الموظفين"};
      setError(map[payload.error]||"تعذر إنشاء الحساب");setSaving(false);return;
    }
    setForm({name:"",username:"",password:"",role:"reception"});setMessage("تم إنشاء حساب الموظف بنجاح.");setSaving(false);await load();
  }

  async function toggle(user:Employee){
    setError("");setMessage("");
    const response=await fetch("/api/admin/users/"+encodeURIComponent(user.id),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({active:!Boolean(user.active)})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){setError(payload.error==="cannot_disable_self"?"لا يمكن تعطيل حساب الإدارة المستخدم حاليًا":"تعذر تحديث الحساب");return}
    setMessage(user.active?"تم تعطيل الحساب.":"تم تفعيل الحساب.");await load();
  }

  return <main className="settings-page">
    <header className="settings-header premium-page-head"><div><span className="section-kicker">TEAM & ACCESS</span><h1>الموظفون والصلاحيات</h1><p>إنشاء الحسابات مع توضيح واضح لما يستطيع كل دور تنفيذه داخل Roomora.</p></div></header>
    {message?<div className="action-banner">{message}</div>:null}{error?<div className="login-error page-error">{error}</div>:null}

    <div className="employees-layout premium-employees-layout">
      <section className="panel settings-card employee-create-card">
        <div className="settings-title"><div className="settings-icon"><Plus size={20}/></div><div><h2>إنشاء مستخدم</h2><p>اختر الدور حسب مهام الموظف، وليس المسمى الوظيفي فقط.</p></div></div>
        <form onSubmit={createUser}>
          <label className="login-field"><span>اسم الموظف</span><div><UserCircle size={18}/><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></div></label>
          <label className="login-field"><span>اسم المستخدم</span><div><Users size={18}/><input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} autoComplete="off" required/></div></label>
          <label className="login-field"><span>كلمة المرور المؤقتة</span><div><ShieldCheck size={18}/><input type={showPassword?"text":"password"} minLength={10} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} autoComplete="new-password" required/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label="إظهار كلمة المرور">{showPassword?<EyeSlash size={18}/>:<Eye size={18}/>}</button></div></label>
          <label className="login-field"><span>الدور</span><div><ShieldCheck size={18}/><select value={form.role} onChange={e=>setForm({...form,role:e.target.value as "admin"|"reception"})}><option value="reception">موظف استقبال</option><option value="admin">مدير النظام</option></select></div></label>
          <div className={"selected-role-summary "+form.role}><ShieldCheck size={18}/><div><b>{roleMeta[form.role].label}</b><span>{roleMeta[form.role].description}</span></div></div>
          <button className="primary-btn full" disabled={saving}>{saving?"جاري الإنشاء…":"إنشاء الحساب"}</button>
        </form>
      </section>

      <section className="panel limits-card employee-directory-card">
        <div className="settings-title"><div className="settings-icon"><Users size={20}/></div><div><h2>الحسابات الحالية</h2><p>{users.length} حساب · التعطيل يمنع تسجيل الدخول فورًا.</p></div></div>
        {loading?<div className="rooms-state">جاري تحميل الحسابات…</div>:<div className="employee-list">{users.map(user=><div className="employee-row pro-employee-row" key={user.id}><div className="avatar">{user.name.slice(0,1)}</div><div className="employee-main"><b>{user.name}</b><span>@{user.username}</span></div><span className={"role-chip "+user.role}>{roleMeta[user.role].label}</span><button className={"status-btn "+(user.active?"active":"inactive")} onClick={()=>void toggle(user)}>{user.active?"نشط":"معطل"}</button></div>)}</div>}
      </section>
    </div>

    <RoleMatrix highlight={form.role}/>
  </main>;
}
