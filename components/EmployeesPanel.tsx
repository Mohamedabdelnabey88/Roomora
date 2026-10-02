"use client";

import { FormEvent,useEffect,useState } from "react";
import { Eye,EyeSlash,NotePencil,Plus,ShieldCheck,UserCircle,Users,X } from "@phosphor-icons/react";
import ModalFrame from "@/components/ui/ModalFrame";
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
  const [editing,setEditing]=useState<Employee|null>(null);
  const [editForm,setEditForm]=useState({name:"",username:"",password:"",role:"reception" as "admin"|"reception",active:true});
  const [showEditPassword,setShowEditPassword]=useState(false);
  const [editSaving,setEditSaving]=useState(false);

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

  function openEdit(user:Employee){
    setEditing(user);
    setEditForm({name:user.name,username:user.username,password:"",role:user.role,active:Boolean(user.active)});
    setShowEditPassword(false);setError("");setMessage("");
  }

  async function saveEdit(e:FormEvent){
    e.preventDefault();
    if(!editing||editSaving)return;
    setEditSaving(true);setError("");setMessage("");
    const response=await fetch("/api/admin/users/"+encodeURIComponent(editing.id),{
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        name:editForm.name.trim(),
        username:editForm.username.trim(),
        role:editForm.role,
        active:editForm.active,
        password:editForm.password||undefined
      })
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const map:Record<string,string>={
        username_exists:"اسم المستخدم مستخدم بالفعل.",
        invalid_user_payload:"تحقق من الاسم واسم المستخدم وكلمة المرور الجديدة (10 أحرف على الأقل).",
        cannot_disable_self:"لا يمكن تعطيل حساب الإدارة المستخدم حاليًا.",
        cannot_demote_self:"لا يمكن تغيير دور حساب الإدارة المستخدم حاليًا إلى موظف استقبال.",
        user_not_found:"حساب الموظف لم يعد موجودًا.",
        forbidden:"ليس لديك صلاحية إدارة الموظفين."
      };
      setError(map[payload.error]||"تعذر حفظ بيانات الموظف.");setEditSaving(false);return;
    }
    setEditing(null);setMessage("تم تحديث بيانات الموظف بنجاح.");setEditSaving(false);await load();
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
        {loading?<div className="rooms-state">جاري تحميل الحسابات…</div>:<div className="employee-list">{users.map(user=><div className="employee-row pro-employee-row" key={user.id}><div className="avatar">{user.name.slice(0,1)}</div><div className="employee-main"><b>{user.name}</b><span>@{user.username}</span></div><span className={"role-chip "+user.role}>{roleMeta[user.role].label}</span><button className="employee-edit-btn" onClick={()=>openEdit(user)}><NotePencil size={14}/> تعديل</button><button className={"status-btn "+(user.active?"active":"inactive")} onClick={()=>void toggle(user)}>{user.active?"نشط":"معطل"}</button></div>)}</div>}
      </section>
    </div>

    <RoleMatrix highlight={form.role}/>

    <ModalFrame open={Boolean(editing)} onClose={()=>!editSaving&&setEditing(null)} className="employee-edit-modal" ariaLabelledBy="employee-edit-title">
      <button className="close" onClick={()=>setEditing(null)} disabled={editSaving}><X size={19}/></button>
      <span className="section-kicker">EDIT EMPLOYEE</span>
      <h2 id="employee-edit-title">تعديل بيانات الموظف</h2>
      <p className="operation-sub">{editing?.name} · @{editing?.username}</p>
      <form onSubmit={saveEdit}>
        <label className="login-field"><span>اسم الموظف</span><div><UserCircle size={18}/><input value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})} required/></div></label>
        <label className="login-field"><span>اسم المستخدم</span><div><Users size={18}/><input value={editForm.username} onChange={e=>setEditForm({...editForm,username:e.target.value})} autoComplete="off" required/></div></label>
        <label className="login-field"><span>كلمة مرور جديدة <small>اختياري</small></span><div><ShieldCheck size={18}/><input type={showEditPassword?"text":"password"} minLength={10} value={editForm.password} onChange={e=>setEditForm({...editForm,password:e.target.value})} autoComplete="new-password" placeholder="اتركها فارغة للإبقاء على الحالية"/><button type="button" onClick={()=>setShowEditPassword(v=>!v)} aria-label="إظهار كلمة المرور">{showEditPassword?<EyeSlash size={18}/>:<Eye size={18}/>}</button></div></label>
        <label className="login-field"><span>الدور</span><div><ShieldCheck size={18}/><select value={editForm.role} onChange={e=>setEditForm({...editForm,role:e.target.value as "admin"|"reception"})}><option value="reception">موظف استقبال</option><option value="admin">مدير النظام</option></select></div></label>
        <label className="employee-active-toggle"><input type="checkbox" checked={editForm.active} onChange={e=>setEditForm({...editForm,active:e.target.checked})}/><span><b>الحساب فعال</b><small>إلغاء التفعيل يمنع الموظف من تسجيل الدخول.</small></span></label>
        <div className={"selected-role-summary "+editForm.role}><ShieldCheck size={18}/><div><b>{roleMeta[editForm.role].label}</b><span>{roleMeta[editForm.role].description}</span></div></div>
        <div className="employee-edit-actions"><button type="button" className="secondary-btn" onClick={()=>setEditing(null)} disabled={editSaving}>إلغاء</button><button className="primary-btn" disabled={editSaving}>{editSaving?"جاري الحفظ…":"حفظ التعديلات"}</button></div>
      </form>
    </ModalFrame>
  </main>;
}
