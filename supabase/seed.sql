-- ==============================================================================
-- ProCURE Complete Database Seed Script
-- Run this script in your Supabase SQL Editor.
-- All accounts are created with Password: Password123!
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_workspace_id_1 uuid := '00000000-0000-0000-0000-000000000001';
  v_workspace_id_2 uuid := '00000000-0000-0000-0000-000000000002';
  
  v_admin_id uuid       := 'a0000000-0000-0000-0000-000000000001';
  v_staff_id uuid       := 'a0000000-0000-0000-0000-000000000002';
  v_sub1_id uuid        := 'a0000000-0000-0000-0000-000000000003';
  v_sub2_id uuid        := 'a0000000-0000-0000-0000-000000000004';
  v_sub3_id uuid        := 'a0000000-0000-0000-0000-000000000005';

  v_sub_record_1 uuid   := 'b0000000-0000-0000-0000-000000000001';
  v_sub_record_2 uuid   := 'b0000000-0000-0000-0000-000000000002';
  v_sub_record_3 uuid   := 'b0000000-0000-0000-0000-000000000003';

  v_dev1_id uuid        := 'c0000000-0000-0000-0000-000000000001';
  v_dev2_id uuid        := 'c0000000-0000-0000-0000-000000000002';
  v_dev3_id uuid        := 'c0000000-0000-0000-0000-000000000003';

  v_scan1_id uuid       := 'd0000000-0000-0000-0000-000000000001';
  v_scan2_id uuid       := 'd0000000-0000-0000-0000-000000000002';
  v_scan3_id uuid       := 'd0000000-0000-0000-0000-000000000003';
  v_scan4_id uuid       := 'd0000000-0000-0000-0000-000000000004';
begin

  -- 1. Create Tenants
  insert into public.tenants (id, name, type, address, credit_balance, kiosk_enabled, status, admin_name, admin_email, admin_phone)
  values 
    (v_workspace_id_1, 'ProCURE Primary Health Hub', 'Clinic', '742 Evergreen Terrace, Medical Suite 4', 500, true, 'active', 'Dr. Johnathan Vance', 'admin@vitalscan.com', '+1 555 0192'),
    (v_workspace_id_2, 'Metro Performance Fitness Center', 'Gym', '120 Grand Avenue, 3rd Floor', 350, true, 'active', 'Marcus Cole', 'admin@metrofit.demo', '+1 555 0193')
  on conflict (id) do update 
    set name = excluded.name, credit_balance = excluded.credit_balance, kiosk_enabled = excluded.kiosk_enabled, admin_name = excluded.admin_name, admin_email = excluded.admin_email, admin_phone = excluded.admin_phone;

  -- 2. Create Auth Users in auth.users (Password: Password123!)
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
  )
  values 
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@vitalscan.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Dr. Johnathan Vance"}'::jsonb, false, now(), now()),
    (v_staff_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff@vitalscan.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Nurse Claire Bennett"}'::jsonb, false, now(), now()),
    (v_sub1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subscriber@vitalscan.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Alex Morgan"}'::jsonb, false, now(), now()),
    (v_sub2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah.johnson@vitalscan.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Sarah Johnson"}'::jsonb, false, now(), now()),
    (v_sub3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcus.chen@vitalscan.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Marcus Chen"}'::jsonb, false, now(), now())
  on conflict (id) do update set encrypted_password = excluded.encrypted_password;

  -- 3. Create Corresponding auth.identities (REQUIRED by Supabase GoTrue Auth)
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  values 
    (v_admin_id, v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@vitalscan.com'), 'email', v_admin_id::text, now(), now(), now()),
    (v_staff_id, v_staff_id, jsonb_build_object('sub', v_staff_id::text, 'email', 'staff@vitalscan.com'), 'email', v_staff_id::text, now(), now(), now()),
    (v_sub1_id, v_sub1_id, jsonb_build_object('sub', v_sub1_id::text, 'email', 'subscriber@vitalscan.com'), 'email', v_sub1_id::text, now(), now(), now()),
    (v_sub2_id, v_sub2_id, jsonb_build_object('sub', v_sub2_id::text, 'email', 'sarah.johnson@vitalscan.com'), 'email', v_sub2_id::text, now(), now(), now()),
    (v_sub3_id, v_sub3_id, jsonb_build_object('sub', v_sub3_id::text, 'email', 'marcus.chen@vitalscan.com'), 'email', v_sub3_id::text, now(), now(), now())
  on conflict (provider, provider_id) do nothing;

  -- 4. Create / Update Profiles
  insert into public.profiles (id, email, full_name, role, workspace_id, status)
  values 
    (v_admin_id, 'admin@vitalscan.com', 'Dr. Johnathan Vance', 'tenant_admin', v_workspace_id_1, 'active'),
    (v_staff_id, 'staff@vitalscan.com', 'Nurse Claire Bennett', 'tenant_staff', v_workspace_id_1, 'active'),
    (v_sub1_id, 'subscriber@vitalscan.com', 'Alex Morgan', 'subscriber', v_workspace_id_1, 'active'),
    (v_sub2_id, 'sarah.johnson@vitalscan.com', 'Sarah Johnson', 'subscriber', v_workspace_id_1, 'active'),
    (v_sub3_id, 'marcus.chen@vitalscan.com', 'Marcus Chen', 'subscriber', v_workspace_id_1, 'active')
  on conflict (id) do update 
    set role = excluded.role, workspace_id = excluded.workspace_id, full_name = excluded.full_name;

  -- 5. Workspace Memberships
  insert into public.workspace_members (workspace_id, user_id, role)
  values 
    (v_workspace_id_1, v_admin_id, 'tenant_admin'),
    (v_workspace_id_1, v_staff_id, 'tenant_staff')
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  -- 6. Kiosk Passcode (Code: 123456)
  insert into public.workspace_secrets (workspace_id, kiosk_code_hash, updated_at)
  values (v_workspace_id_1, public.hash_kiosk_code('123456'), now())
  on conflict (workspace_id) do update set kiosk_code_hash = excluded.kiosk_code_hash;

  -- 7. Registered Devices
  insert into public.devices (id, workspace_id, device_code, label, type, location, status)
  values 
    (v_dev1_id, v_workspace_id_1, 'PC-RECEPT01', 'Reception Desk Kiosk', 'camera', 'Main Lobby Station 1', 'active'),
    (v_dev2_id, v_workspace_id_1, 'PC-CLINIC02', 'Clinical Suite Scanner', 'camera', 'Consultation Room 104', 'active'),
    (v_dev3_id, v_workspace_id_1, 'PC-GYM03', 'Wellness Floor Camera', 'camera', 'Cardio Recovery Zone', 'active')
  on conflict (id) do update set label = excluded.label, status = excluded.status;

  -- 8. Subscribers Directory
  insert into public.subscribers (
    id, workspace_id, user_id, full_name, email, phone, whatsapp_number,
    date_of_birth, biological_sex, height_cm, weight_kg, national_id_passport,
    consent_tenant_view_results, is_guest, status
  )
  values 
    (v_sub_record_1, v_workspace_id_1, v_sub1_id, 'Alex Morgan', 'subscriber@vitalscan.com', '+1-555-019-2834', '+1-555-019-2834', '1992-05-14', 'Female', 168, 62.5, 'P92837461', true, false, 'active'),
    (v_sub_record_2, v_workspace_id_1, v_sub2_id, 'Sarah Johnson', 'sarah.johnson@vitalscan.com', '+1-555-014-9821', '+1-555-014-9821', '1988-11-23', 'Female', 172, 68.0, 'P81726354', true, false, 'active'),
    (v_sub_record_3, v_workspace_id_1, v_sub3_id, 'Marcus Chen', 'marcus.chen@vitalscan.com', '+1-555-018-4490', '+1-555-018-4490', '1985-03-09', 'Male', 180, 79.2, 'P10293847', false, false, 'active')
  on conflict (id) do update 
    set full_name = excluded.full_name, consent_tenant_view_results = excluded.consent_tenant_view_results;

  -- 9. Scans History
  insert into public.scans (id, workspace_id, subscriber_id, device_id, operator_user_id, status, source, credit_owner_type, credit_used, started_at, completed_at)
  values 
    (v_scan1_id, v_workspace_id_1, v_sub_record_1, v_dev1_id, v_staff_id, 'completed', 'camera', 'tenant', 1, now() - interval '2 hours', now() - interval '2 hours' + interval '45 seconds'),
    (v_scan2_id, v_workspace_id_1, v_sub_record_1, v_dev2_id, v_admin_id, 'completed', 'camera', 'subscriber', 1, now() - interval '2 days', now() - interval '2 days' + interval '45 seconds'),
    (v_scan3_id, v_workspace_id_1, v_sub_record_2, v_dev1_id, v_staff_id, 'completed', 'camera', 'tenant', 1, now() - interval '1 day', now() - interval '1 day' + interval '45 seconds'),
    (v_scan4_id, v_workspace_id_1, v_sub_record_3, v_dev3_id, v_staff_id, 'completed', 'camera', 'tenant', 1, now() - interval '3 hours', now() - interval '3 hours' + interval '45 seconds')
  on conflict (id) do update set status = excluded.status;

  -- 10. Clinical Scan Results & Telemetry
  insert into public.scan_results (
    id, scan_id, heart_rate, respiratory_rate, systolic_bp, diastolic_bp,
    oxygen_saturation, stress_index, wellness_score, cardiovascular_age,
    cvd_risk_percentage, telemetry, signal_quality, low_confidence_flags
  )
  values 
    (gen_random_uuid(), v_scan1_id, 71.5, 15.0, 118.0, 78.0, 98.5, 26.0, 9.1, 31.0, 2.8, '{"hrv_sdnn": 58, "hrv_rmssd": 44, "perfusion_index": 4.2}'::jsonb, '{"snr": 18.5, "face_tracking_score": 0.98}'::jsonb, '[]'::jsonb),
    (gen_random_uuid(), v_scan2_id, 74.0, 16.0, 121.0, 80.0, 98.0, 32.0, 8.6, 33.0, 3.1, '{"hrv_sdnn": 52, "hrv_rmssd": 39, "perfusion_index": 3.9}'::jsonb, '{"snr": 17.2, "face_tracking_score": 0.96}'::jsonb, '[]'::jsonb),
    (gen_random_uuid(), v_scan3_id, 68.0, 14.5, 116.0, 76.0, 99.0, 21.0, 9.4, 35.0, 2.4, '{"hrv_sdnn": 64, "hrv_rmssd": 49, "perfusion_index": 4.8}'::jsonb, '{"snr": 19.1, "face_tracking_score": 0.99}'::jsonb, '[]'::jsonb),
    (gen_random_uuid(), v_scan4_id, 82.0, 17.5, 126.0, 83.0, 97.5, 42.0, 8.0, 41.0, 4.6, '{"hrv_sdnn": 44, "hrv_rmssd": 32, "perfusion_index": 3.5}'::jsonb, '{"snr": 16.8, "face_tracking_score": 0.94}'::jsonb, '[]'::jsonb)
  on conflict (scan_id) do update set heart_rate = excluded.heart_rate, systolic_bp = excluded.systolic_bp, wellness_score = excluded.wellness_score;

  -- 11. Manual Self-Reports
  insert into public.self_reports (
    subscriber_id, recorded_at, heart_rate, respiratory_rate, systolic_bp,
    diastolic_bp, oxygen_saturation, stress_index, wellness_score, symptoms, notes, created_by
  )
  values 
    (v_sub_record_1, now() - interval '4 days', 72.0, 15.0, 120.0, 79.0, 98.0, 28.0, 8.8, 'None', 'Morning baseline before cardio workout.', v_sub1_id),
    (v_sub_record_1, now() - interval '1 week', 76.0, 16.0, 122.0, 81.0, 97.5, 36.0, 8.2, 'Mild fatigue', 'Post-work evening entry.', v_sub1_id),
    (v_sub_record_2, now() - interval '3 days', 69.0, 14.0, 117.0, 77.0, 99.0, 22.0, 9.3, 'None', 'Weekly wellness check-in.', v_sub2_id);

  -- 12. Credit Ledger
  insert into public.credit_ledger (workspace_id, subscriber_id, amount, entry_type, created_by)
  values 
    (v_workspace_id_1, null, 500, 'grant', v_admin_id),
    (v_workspace_id_1, v_sub_record_1, -1, 'consume', v_staff_id),
    (v_workspace_id_1, v_sub_record_2, -1, 'consume', v_staff_id),
    (v_workspace_id_1, v_sub_record_3, -1, 'consume', v_staff_id);

  -- 13. Audit Logs
  insert into public.audit_logs (workspace_id, actor_user_id, action, resource_type, metadata)
  values 
    (v_workspace_id_1, v_admin_id, 'workspace_provisioned', 'workspace', '{"name":"ProCURE Primary Health Hub"}'::jsonb),
    (v_workspace_id_1, v_admin_id, 'device_registered', 'device', '{"device_code":"PC-RECEPT01","label":"Reception Desk Kiosk"}'::jsonb),
    (v_workspace_id_1, v_admin_id, 'kiosk_settings_updated', 'workspace', '{"kiosk_enabled":true}'::jsonb);

end $$;