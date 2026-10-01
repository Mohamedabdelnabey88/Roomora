UPDATE request_items SET active=0 WHERE id='towel';

INSERT OR IGNORE INTO request_items (id,name,unit,max_per_request,max_per_business_day,max_per_stay,active) VALUES
('fine-tissues','فاين / مناديل','علبة',2,4,10,1),
('towel-small','منشفة صغيرة','قطعة',4,6,12,1),
('towel-large','منشفة كبيرة','قطعة',2,4,8,1),
('slippers','سليبر','زوج',2,2,4,1);
