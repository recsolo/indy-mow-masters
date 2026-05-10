$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$locationPages = @(
  'lawn-mowing-indianapolis.html',
  'lawn-mowing-avon.html',
  'lawn-mowing-plainfield.html',
  'lawn-mowing-brownsburg.html',
  'lawn-mowing-speedway.html'
)

$expectedPages = @(
  'lawn-care-indianapolis-in.html',
  'lawn-mowing-indianapolis.html',
  'lawn-mowing-avon.html',
  'lawn-mowing-plainfield.html',
  'lawn-mowing-brownsburg.html',
  'lawn-mowing-speedway.html',
  'reviews.html'
)

$failures = New-Object System.Collections.Generic.List[string]

function Test-Contains {
  param(
    [string]$Html,
    [string]$Needle,
    [string]$Context
  )

  if ($Html -notlike "*$Needle*") {
    $script:failures.Add("$Context missing $Needle")
  }
}

function Test-JsonLd {
  param(
    [string]$Html,
    [string]$Context
  )

  $matches = [regex]::Matches($Html, '<script type="application/ld\+json">\s*(?<json>.*?)\s*</script>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($matches.Count -eq 0) {
    $script:failures.Add("$Context missing JSON-LD structured data")
    return
  }

  foreach ($match in $matches) {
    try {
      $match.Groups['json'].Value | ConvertFrom-Json | Out-Null
    }
    catch {
      $script:failures.Add("$Context has invalid JSON-LD: $($_.Exception.Message)")
    }
  }
}

foreach ($page in $expectedPages) {
  $path = Join-Path $root $page
  if (-not (Test-Path -LiteralPath $path)) {
    $failures.Add("Missing page: $page")
    continue
  }

  $html = Get-Content -Raw -LiteralPath $path
  foreach ($required in @('<title>', '<meta name="description"', '<link rel="canonical"', 'tel:3173860400', '<meta property="og:type" content="website"', '<meta property="og:url"', '<meta name="twitter:card"')) {
    Test-Contains -Html $html -Needle $required -Context $page
  }

  Test-JsonLd -Html $html -Context $page
}

foreach ($page in $locationPages) {
  $html = Get-Content -Raw -LiteralPath (Join-Path $root $page)
  foreach ($required in @('Request a Free Quote', 'Frequently Asked Questions', 'Mow &amp; Go', 'BreadcrumbList')) {
    Test-Contains -Html $html -Needle $required -Context $page
  }
}

$seoPagePath = Join-Path $root 'lawn-care-indianapolis-in.html'
if (Test-Path -LiteralPath $seoPagePath) {
  $seoPage = Get-Content -Raw -LiteralPath $seoPagePath
  foreach ($required in @(
    '<title>Professional Lawn Care Services in Indianapolis, IN | Indy Mow Masters</title>',
    '<meta name="description" content="Indy Mow Masters provides professional lawn care, mowing, trimming, edging, and yard maintenance services in Indianapolis, IN. Schedule reliable lawn service today."',
    '<link rel="canonical" href="https://www.indymowmasters.com/lawn-care-indianapolis-in" />',
    'Professional Lawn Care Services for a Healthy, Green Yard',
    'Schedule Lawn Care Service',
    'Get a Free Estimate',
    'BreadcrumbList',
    'FAQPage'
  )) {
    Test-Contains -Html $seoPage -Needle $required -Context 'lawn-care-indianapolis-in.html'
  }

  $h1Count = ([regex]::Matches($seoPage, '<h1[\s>]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
  if ($h1Count -ne 1) {
    $failures.Add("lawn-care-indianapolis-in.html should contain exactly one H1, found $h1Count")
  }
}

$index = Get-Content -Raw -LiteralPath (Join-Path $root 'index.html')
foreach ($page in $expectedPages) {
  if ($page -eq 'lawn-care-indianapolis-in.html') {
    continue
  }

  if ($index -notlike "*$page*") {
    $failures.Add("index.html does not link to $page")
  }
}

foreach ($required in @('/lawn-care-indianapolis-in', 'Lawn Care Services in Indianapolis, IN', 'View Lawn Care Services', '>Services<')) {
  Test-Contains -Html $index -Needle $required -Context 'index.html'
}

foreach ($required in @('FAQPage', 'Frequently Asked Questions', 'name="lead_source"', 'sms:3173860400', 'mobile-sticky-cta')) {
  Test-Contains -Html $index -Needle $required -Context 'index.html'
}

if ($index -like '*"aggregateRating"*' -or $index -like '*"@type": "Review"*') {
  $failures.Add('index.html should not mark up self-serving LocalBusiness reviews in JSON-LD')
}

Test-JsonLd -Html $index -Context 'index.html'

$sitemap = Get-Content -Raw -LiteralPath (Join-Path $root 'sitemap.xml')
foreach ($page in $expectedPages) {
  if ($page -eq 'lawn-care-indianapolis-in.html') {
    continue
  }

  if ($sitemap -notlike "*https://www.indymowmasters.com/$page*") {
    $failures.Add("sitemap.xml missing $page")
  }
}

if ($sitemap -notlike '*https://www.indymowmasters.com/lawn-care-indianapolis-in*') {
  $failures.Add('sitemap.xml missing /lawn-care-indianapolis-in')
}

$vercel = Get-Content -Raw -LiteralPath (Join-Path $root 'vercel.json')
foreach ($required in @('"source": "/lawn-care-indianapolis-in"', '"destination": "/lawn-care-indianapolis-in.html"')) {
  Test-Contains -Html $vercel -Needle $required -Context 'vercel.json'
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
  exit 1
}

Write-Output "Marketing page validation passed for $($expectedPages.Count) pages."
