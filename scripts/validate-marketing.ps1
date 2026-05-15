$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$locationPages = @(
  'lawn-mowing-avon.html',
  'lawn-mowing-plainfield.html',
  'lawn-mowing-brownsburg.html',
  'lawn-mowing-speedway.html'
)

$expectedPages = @(
  'lawn-care-indianapolis-in.html',
  'lawn-care-tips-indianapolis-in.html',
  'best-grass-height-indianapolis-in.html',
  'weed-control-tips-indianapolis-in.html',
  'lawn-care-products.html',
  'privacy-policy.html',
  'lawn-mowing-indianapolis.html',
  'leaf-cleanup-indianapolis.html',
  'yard-cleanup-indianapolis.html',
  'weed-pulling-indianapolis.html',
  'mulch-installation-indianapolis.html',
  'drainage-cleanup-indianapolis.html',
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
  $requiredTags = @('<title>', '<meta name="description"', '<link rel="canonical"', '<meta property="og:type" content="website"', '<meta property="og:url"')
  if ($page -ne 'lawn-mowing-indianapolis.html') {
    $requiredTags += @('<meta name="twitter:card"')
  }

  foreach ($required in $requiredTags) {
    Test-Contains -Html $html -Needle $required -Context $page
  }

  if ($html -notlike '*tel:3173860400*' -and $html -notlike '*tel:+13173860400*') {
    $failures.Add("$page missing phone link")
  }

  foreach ($requiredNav in @('/lawn-care-indianapolis-in', '/lawn-care-tips-indianapolis-in', '/lawn-care-products', '/privacy-policy')) {
    Test-Contains -Html $html -Needle $requiredNav -Context $page
  }

  Test-JsonLd -Html $html -Context $page
}

foreach ($page in $locationPages) {
  $html = Get-Content -Raw -LiteralPath (Join-Path $root $page)
  foreach ($required in @('Request a Free Quote', 'Frequently Asked Questions', 'Mow &amp; Go', 'BreadcrumbList')) {
    Test-Contains -Html $html -Needle $required -Context $page
  }
}

$affiliatePagePath = Join-Path $root 'lawn-care-products.html'
if (Test-Path -LiteralPath $affiliatePagePath) {
  $affiliateHtml = Get-Content -Raw -LiteralPath $affiliatePagePath
  foreach ($required in @(
    '<title>Lawn Care Products and Yard Tools | Indy Mow Masters</title>',
    '<link rel="canonical" href="https://www.indymowmasters.com/lawn-care-products" />',
    'Lawn Care Products and Yard Tools',
    'As an Amazon Associate I earn from qualifying purchases.',
    'mteezy74-20',
    'rel="sponsored nofollow noopener"',
    'target="_blank"',
    'FAQPage'
  )) {
    Test-Contains -Html $affiliateHtml -Needle $required -Context 'lawn-care-products.html'
  }

  $h1Count = ([regex]::Matches($affiliateHtml, '<h1[\s>]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
  if ($h1Count -ne 1) {
    $failures.Add("lawn-care-products.html should contain exactly one H1, found $h1Count")
  }

  $amazonLinks = [regex]::Matches($affiliateHtml, '<a\b(?=[^>]*href="https://www\.amazon\.com/)[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($amazonLinks.Count -lt 6) {
    $failures.Add("lawn-care-products.html should include at least 6 Amazon affiliate links")
  }

  foreach ($link in $amazonLinks) {
    $tag = $link.Value
    if ($tag -notlike '*tag=mteezy74-20*') {
      $failures.Add("Amazon link missing affiliate tag: $tag")
    }
    if ($tag -notlike '*rel="sponsored nofollow noopener"*') {
      $failures.Add("Amazon link missing sponsored nofollow noopener rel: $tag")
    }
    if ($tag -notlike '*target="_blank"*') {
      $failures.Add("Amazon link missing target blank: $tag")
    }
  }
}

$privacyPagePath = Join-Path $root 'privacy-policy.html'
if (Test-Path -LiteralPath $privacyPagePath) {
  $privacyHtml = Get-Content -Raw -LiteralPath $privacyPagePath
  foreach ($required in @(
    '<title>Privacy Policy | Indy Mow Masters</title>',
    '<link rel="canonical" href="https://www.indymowmasters.com/privacy-policy" />',
    '<h1>Privacy Policy</h1>',
    'Information We Collect',
    'Formspree',
    'As an Amazon Associate I earn from qualifying purchases.',
    'BreadcrumbList'
  )) {
    Test-Contains -Html $privacyHtml -Needle $required -Context 'privacy-policy.html'
  }
}

$educationPages = @(
  @{
    File = 'lawn-care-tips-indianapolis-in.html'
    Route = '/lawn-care-tips-indianapolis-in'
    Title = '<title>Lawn Care Tips for Indianapolis, IN | Grass Height, Weeds &amp; Yard Care</title>'
    H1 = 'Lawn Care Tips for Indianapolis Homeowners'
    Required = @('3 to 4 inches', 'one-third rule', 'crabgrass', 'broadleaf weeds', 'Get a Free Estimate', 'FAQPage')
  },
  @{
    File = 'best-grass-height-indianapolis-in.html'
    Route = '/best-grass-height-indianapolis-in'
    Title = '<title>Best Grass Height for Indianapolis Lawns | Indy Mow Masters</title>'
    H1 = 'Best Grass Height for Indianapolis Lawns'
    Required = @('3 to 4 inches', 'Never remove more than one-third', 'Kentucky bluegrass', 'tall fescue', 'Schedule Lawn Care Service', 'FAQPage')
  },
  @{
    File = 'weed-control-tips-indianapolis-in.html'
    Route = '/weed-control-tips-indianapolis-in'
    Title = '<title>Weed Control Tips for Indianapolis Lawns | Indy Mow Masters</title>'
    H1 = 'Weed Control Tips for Indianapolis Lawns'
    Required = @('crabgrass', 'dandelions', 'broadleaf weeds', 'read and follow the product label', 'Get a Free Estimate', 'FAQPage')
  }
)

foreach ($pageInfo in $educationPages) {
  $pagePath = Join-Path $root $pageInfo.File
  if (-not (Test-Path -LiteralPath $pagePath)) {
    $failures.Add("Missing education page: $($pageInfo.File)")
    continue
  }

  $html = Get-Content -Raw -LiteralPath $pagePath
  Test-Contains -Html $html -Needle $pageInfo.Title -Context $pageInfo.File
  Test-Contains -Html $html -Needle "<link rel=`"canonical`" href=`"https://www.indymowmasters.com$($pageInfo.Route)`" />" -Context $pageInfo.File
  Test-Contains -Html $html -Needle $pageInfo.H1 -Context $pageInfo.File
  foreach ($required in $pageInfo.Required) {
    Test-Contains -Html $html -Needle $required -Context $pageInfo.File
  }

  $h1Count = ([regex]::Matches($html, '<h1[\s>]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
  if ($h1Count -ne 1) {
    $failures.Add("$($pageInfo.File) should contain exactly one H1, found $h1Count")
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
  if ($page -in @('lawn-care-indianapolis-in.html', 'lawn-care-tips-indianapolis-in.html', 'best-grass-height-indianapolis-in.html', 'weed-control-tips-indianapolis-in.html', 'lawn-care-products.html', 'privacy-policy.html')) {
    continue
  }

  if ($index -notlike "*$page*") {
    $failures.Add("index.html does not link to $page")
  }
}

foreach ($required in @('/lawn-care-indianapolis-in', 'Lawn Care Services in Indianapolis, IN', 'View Lawn Care Services', '>Services<')) {
  Test-Contains -Html $index -Needle $required -Context 'index.html'
}

foreach ($required in @('/lawn-care-tips-indianapolis-in', 'Lawn Care Tips for Indianapolis Homeowners', 'Read Lawn Care Tips', '>Tips<')) {
  Test-Contains -Html $index -Needle $required -Context 'index.html'
}

foreach ($required in @('/lawn-care-products', 'Lawn Care Products and Yard Tools', 'Shop Yard Tools', '>Products<')) {
  Test-Contains -Html $index -Needle $required -Context 'index.html'
}

foreach ($required in @('/privacy-policy', 'Privacy Policy')) {
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
  if ($page -in @('lawn-care-indianapolis-in.html', 'lawn-care-tips-indianapolis-in.html', 'best-grass-height-indianapolis-in.html', 'weed-control-tips-indianapolis-in.html', 'lawn-care-products.html', 'privacy-policy.html')) {
    continue
  }

  if ($sitemap -notlike "*https://www.indymowmasters.com/$page*") {
    $failures.Add("sitemap.xml missing $page")
  }
}

if ($sitemap -notlike '*https://www.indymowmasters.com/lawn-care-indianapolis-in*') {
  $failures.Add('sitemap.xml missing /lawn-care-indianapolis-in')
}

foreach ($pageInfo in $educationPages) {
  if ($sitemap -notlike "*https://www.indymowmasters.com$($pageInfo.Route)*") {
    $failures.Add("sitemap.xml missing $($pageInfo.Route)")
  }
}

if ($sitemap -notlike '*https://www.indymowmasters.com/lawn-care-products*') {
  $failures.Add('sitemap.xml missing /lawn-care-products')
}

if ($sitemap -notlike '*https://www.indymowmasters.com/privacy-policy*') {
  $failures.Add('sitemap.xml missing /privacy-policy')
}

$vercel = Get-Content -Raw -LiteralPath (Join-Path $root 'vercel.json')
foreach ($required in @('"source": "/lawn-care-indianapolis-in"', '"destination": "/lawn-care-indianapolis-in.html"')) {
  Test-Contains -Html $vercel -Needle $required -Context 'vercel.json'
}

foreach ($required in @('"source": "/lawn-care-products"', '"destination": "/lawn-care-products.html"')) {
  Test-Contains -Html $vercel -Needle $required -Context 'vercel.json'
}

foreach ($required in @('"source": "/privacy-policy"', '"destination": "/privacy-policy.html"')) {
  Test-Contains -Html $vercel -Needle $required -Context 'vercel.json'
}

foreach ($pageInfo in $educationPages) {
  Test-Contains -Html $vercel -Needle "`"source`": `"$($pageInfo.Route)`"" -Context 'vercel.json'
  Test-Contains -Html $vercel -Needle "`"destination`": `"/$($pageInfo.File)`"" -Context 'vercel.json'
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
  exit 1
}

Write-Output "Marketing page validation passed for $($expectedPages.Count) pages."
