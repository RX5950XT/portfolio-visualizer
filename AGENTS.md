<claude-mem-context>
# Memory Context

# [portfolio-app] recent context, 2026-05-14 12:56am GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,523t read) | 142,671t work | 88% savings

### May 13, 2026
849 11:02p ✅ supabase/schema.sql Updated with Explicit GRANTs for holdings, daily_snapshots, etf_expense_ratios
850 " ✅ migrations/create_transactions.sql Updated with Explicit GRANTs for transactions Table
852 " ✅ migrations/create_portfolios.sql Updated with GRANTs for portfolios, holdings, and cash_balance
853 11:03p 🔵 cash_balance CREATE TABLE Definitively Absent from All Repository SQL Files
855 " 🔵 cash_balance Table Schema Inferred from API Route Code
857 " ✅ cash_balance CREATE TABLE Added to supabase/schema.sql — Previously Untracked Table Now in Source Control
858 11:04p ✅ Index idx_cash_portfolio Added to cash_balance(portfolio_id) in schema.sql
860 " ✅ cash_balance Gets Full RLS + Policy + GRANTs in supabase/schema.sql — Remediation Complete for Base Schema Tables
S50 Supabase Data API GRANT remediation for portfolio-app — respond to Supabase's May 30 2026 policy change requiring explicit GRANTs on public schema tables (May 13, 11:05 PM)
869 11:11p 🔵 User Queried Whether to Document Browser-Resolved Issue in Global Agent Config Files
870 11:12p 🔵 portfolio-app Uses Hosted Supabase Only — No Local supabase/config.toml
871 " 🔵 portfolio-app .env.local Contains Full Supabase Credentials and Auth Config
872 " 🔵 Global CLAUDE.md Defines Comprehensive Agent Decision Tree for All Projects
873 " 🔵 Supabase CLI v2.90.0 Installed at C:\Users\rx595\.local\bin
874 " 🔵 Supabase Account Has Two Projects; portfolio-app Not Linked to Local Directory
875 " 🔵 supabase link Failed Due to Semicolon in DB Password Causing Shell Parsing Error
876 " 🔵 portfolio-app Has No supabase/ or migrations/ Directory — Schema Not Version-Controlled Locally
880 11:17p ⚖️ User Questioned Global Config Documentation Strategy
881 " 🔵 Portfolio Visualizer Project CLAUDE.md Structure Discovered
882 11:18p 🔵 Supabase Local Dev Configuration for Portfolio App
887 " 🔵 Supabase CLI Version Outdated
893 11:20p 🔵 Supabase Project Is Linked to Remote
895 11:21p 🔵 Supabase Remote Project Reference Identified
896 " 🔵 supabase db query Supports --linked Flag for Remote DB Queries
897 11:22p ✅ Created grant_fix.sql to Patch Missing Supabase Data API Permissions
898 " 🔵 Remote Database Missing daily_snapshots and etf_expense_ratios Tables
910 11:31p 🚨 Supabase Data API Default Grant Policy Change — Action Required Before May 30, 2026
911 " 🔵 portfolio-app SQL Audit: All 5 Tables Lacked Explicit GRANTs; cash_balance Completely Untracked in Source Control
912 " 🔴 Explicit GRANTs Added to All portfolio-app SQL Migration Files and Schema
913 " 🟣 cash_balance Table Added to Source Control with Full Schema, RLS, Policies, and GRANTs
914 " 🔵 portfolio-app Infrastructure: Hosted Supabase Only, CLI Linked but Remote DB Missing Two Tables
915 " 🟣 grant_fix.sql Created to Patch Missing Supabase Data API Permissions on Live Remote Database
916 11:34p 🚨 Supabase Data API Default Grant Policy Change — Action Required
917 " 🔵 Full SQL Audit: All 5 Tables Lack Explicit GRANTs; portfolios Table Also Missing RLS
918 " 🔴 Explicit GRANTs Added to All Migration Files and schema.sql
919 " 🔵 Remote Database Missing daily_snapshots and etf_expense_ratios Tables
920 " 🔵 Remote DB RLS Audit: Only 3 of 6 Tables Have Policies; portfolios Has None
921 " 🟣 Idempotent Remediation Migration Created: 20260513_supabase_data_api_remediation.sql
922 " ✅ README.md and CLAUDE.md Updated to Include Remediation Migration in Setup Instructions
923 11:35p 🔵 supabase db query --linked --file Consistently Times Out at 64 Seconds
924 " 🔵 ESLint Reveals 4 Errors and 8 Warnings in portfolio-app Codebase
925 11:36p 🔵 supabase db query --linked Unreliable: pg_tables System Catalog Also Times Out
926 " 🔵 Remote DB State Unchanged: Migration Not Yet Applied After CLI Timeout Failures
927 11:37p 🔵 Supabase Pooler Connection URL Found — Direct psql Connection Path Available
928 11:38p 🔵 --dns-resolver https Flag Unblocks supabase CLI Queries; Circuit Breaker Triggered by Retry Storm
929 " 🔴 Remediation Migration Successfully Applied to Remote Supabase Database
930 11:39p 🔵 Data API Verification: All 6 Tables Return HTTP 200 for Both anon and service_role Keys
931 11:40p 🔵 Database-Level RLS Policy Verification: All 3 Previously Missing Policies Now Confirmed Present
932 " 🔴 ESLint Errors Fixed: prefer-const in asset-trend Route and Two any-Types in DailyPnLChart
933 11:41p 🔴 PieChart.tsx: CustomTooltip Moved Outside Render Function — React State Reset Bug Fixed
934 " 🔴 ESLint Now Passes With Zero Errors — All 4 Blocking Errors Resolved

Access 143k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>