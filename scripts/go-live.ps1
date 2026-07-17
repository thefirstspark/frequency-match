# Frequency Match freemium go-live helper
# Prerequisites: npx, supabase account access token, Stripe keys
# Usage:
#   $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'   # https://supabase.com/dashboard/account/tokens
#   .\scripts\go-live.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$ProjectRef = 'ffqcoewjggjgwfsriavj'

Write-Host "== Frequency Match go-live ==" -ForegroundColor Cyan

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "Missing SUPABASE_ACCESS_TOKEN." -ForegroundColor Yellow
  Write-Host "Create one: https://supabase.com/dashboard/account/tokens"
  Write-Host 'Then: $env:SUPABASE_ACCESS_TOKEN = "sbp_..."'
  exit 1
}

Write-Host "1) Linking project $ProjectRef ..."
npx --yes supabase link --project-ref $ProjectRef

Write-Host "2) Applying schema (SQL) ..."
# Prefer db query via CLI if available; else print path for SQL editor
$sql = Join-Path $Root 'supabase\schema.sql'
if (Get-Command npx -ErrorAction SilentlyContinue) {
  Write-Host "Open SQL editor and paste: $sql" -ForegroundColor Yellow
  Write-Host "https://supabase.com/dashboard/project/$ProjectRef/sql/new"
  Start-Process "https://supabase.com/dashboard/project/$ProjectRef/sql/new"
}

Write-Host "3) Deploy Edge Functions ..."
npx --yes supabase functions deploy create-checkout --project-ref $ProjectRef
npx --yes supabase functions deploy create-portal --project-ref $ProjectRef
npx --yes supabase functions deploy stripe-webhook --project-ref $ProjectRef

Write-Host @"

Next (manual, once):
  A) API keys → paste publishable key into js/config.js  SUPABASE_PUBLISHABLE_KEY
     https://supabase.com/dashboard/project/$ProjectRef/settings/api

  B) Auth → URL config
     Site URL: https://frequency.thefirstspark.shop
     Redirect: https://frequency.thefirstspark.shop/**

  C) Stripe → product Frequency Pro `$4.99/mo → copy price_... into STRIPE_PRICE_ID

  D) Secrets:
     npx supabase secrets set STRIPE_SECRET_KEY=sk_... --project-ref $ProjectRef
     npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref $ProjectRef
     npx supabase secrets set SITE_URL=https://frequency.thefirstspark.shop --project-ref $ProjectRef

  E) Stripe webhook endpoint:
     https://$ProjectRef.supabase.co/functions/v1/stripe-webhook
     events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

  F) git push (already may be done) so GH Pages picks up config once key is filled

"@ -ForegroundColor Green
