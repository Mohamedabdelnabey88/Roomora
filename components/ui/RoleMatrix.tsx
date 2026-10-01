"use client";

import { CheckCircle,XCircle } from "@phosphor-icons/react";
import { roleCapabilities,roleMeta,type RoomoraRole } from "@/lib/roles";

export default function RoleMatrix({compact=false,highlight}:{compact?:boolean;highlight?:RoomoraRole}){
  return <section className={"role-matrix "+(compact?"compact":"")}>
    <div className="role-matrix-head">
      <div><span className="section-kicker">ROLE ACCESS</span><h3>مصفوفة الصلاحيات</h3></div>
      <p>الصلاحيات الفعلية المطبقة في النظام، وليست وصفًا تسويقيًا.</p>
    </div>
    <div className="role-matrix-table-wrap">
      <table className="role-matrix-table">
        <thead><tr><th>الوظيفة</th><th className={highlight==="reception"?"highlight":""}>{roleMeta.reception.label}</th><th className={highlight==="admin"?"highlight":""}>{roleMeta.admin.label}</th></tr></thead>
        <tbody>{roleCapabilities.map(cap=><tr key={cap.key}>
          <td><b>{cap.label}</b><small>{cap.description}</small></td>
          <td className={highlight==="reception"?"highlight":""}>{cap.reception?<span className="permission yes"><CheckCircle size={16} weight="fill"/> مسموح</span>:<span className="permission no"><XCircle size={16}/> غير مسموح</span>}</td>
          <td className={highlight==="admin"?"highlight":""}>{cap.admin?<span className="permission yes"><CheckCircle size={16} weight="fill"/> مسموح</span>:<span className="permission no"><XCircle size={16}/> غير مسموح</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
