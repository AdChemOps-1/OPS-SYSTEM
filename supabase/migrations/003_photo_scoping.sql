-- AdChem Ops — 003, as applied to the operations database on 10/17/26. Record only.
-- Photos (signed BOLs, deposit slips) are stored as {company}/{hub}/{pod|deposits}/[orderId/]{time}.jpg.
-- A driver can write only under their own company and hub, and read back only what they uploaded;
-- coordinators and admins read their own company's photos. Before this, any signed-in member could read every photo.

alter policy "dispatch pods read" on storage.objects using (bucket_id = 'dispatch-pods' and (public.dispatch_can_edit_in((storage.foldername(name))[1]) or owner_id = (select auth.uid())::text));
alter policy "dispatch pods write" on storage.objects with check (bucket_id = 'dispatch-pods' and public.dispatch_can_see_in((storage.foldername(name))[1], (storage.foldername(name))[2]));

-- Proof-of-delivery records (they carry customer copy-to addresses): coordinators and admins of the company, or the sender.
alter policy dp_read on public.dispatch_pods using (public.dispatch_can_edit_in(company) or sent_by = (select auth.uid()));

-- The server also refuses a photo path that is not this order's (pod) or this company and hub's deposits folder (deposit).
