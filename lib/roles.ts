export type RoomoraRole="admin"|"reception";

export type Capability={
  key:string;
  label:string;
  description:string;
  reception:boolean;
  admin:boolean;
};

export const roleCapabilities:Capability[]=[
  {key:"rooms.view",label:"عرض الغرف والإقامات",description:"مشاهدة حالة الغرف والنزيل الحالي.",reception:true,admin:true},
  {key:"stays.manage",label:"إدارة الإقامة",description:"تسكين النزيل وتمديد الإقامة وتسجيل الخروج.",reception:true,admin:true},
  {key:"requests.manage",label:"تشغيل طلبات الغرف",description:"إنشاء الطلب واستلامه وبدء التجهيز والتسليم أو الإلغاء.",reception:true,admin:true},
  {key:"reports.view",label:"عرض التقارير",description:"مشاهدة مؤشرات التشغيل وتصدير التقرير.",reception:true,admin:true},
  {key:"approvals.decide",label:"قرارات تجاوز الحدود",description:"الموافقة أو الرفض عندما يتجاوز الطلب الحدود.",reception:false,admin:true},
  {key:"requests.delete",label:"الحذف النهائي للطلبات",description:"حذف طلب خدمة نهائيًا مع أصنافه والموافقة المرتبطة به.",reception:false,admin:true},
  {key:"stays.edit",label:"تصحيح بيانات الحجز والإقامة",description:"تعديل بيانات النزيل ومواعيد الدخول والخروج لتصحيح أخطاء التسجيل.",reception:false,admin:true},
  {key:"stays.delete",label:"حذف النزيل والحجز نهائيًا",description:"حذف ملف الإقامة وكل الطلبات والتمديدات المرتبطة به، مع تحرير الغرفة إذا كانت الإقامة نشطة.",reception:false,admin:true},
  {key:"guests.private",label:"ملف الإقامة التفصيلي",description:"فتح الملف الإداري الكامل وسجل التمديدات والطلبات.",reception:false,admin:true},
  {key:"employees.manage",label:"إدارة الموظفين",description:"إنشاء الحسابات وتفعيلها أو تعطيلها.",reception:false,admin:true},
  {key:"limits.manage",label:"تعديل حدود المستهلكات",description:"تغيير حد الطلب واليوم والإقامة لكل صنف.",reception:false,admin:true}
];

export const roleMeta:Record<RoomoraRole,{label:string;description:string}>={
  reception:{label:"موظف استقبال",description:"تشغيل يومي للغرف والإقامات والطلبات بدون صلاحيات إدارية حساسة."},
  admin:{label:"مدير النظام",description:"وصول تشغيلي كامل مع الموافقات وإدارة الموظفين وحدود المستهلكات."}
};
