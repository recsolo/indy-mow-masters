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
  'leaf-cleanup.html',
  'gutter-cleaning.html',
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
  $requiredTags = @('<title>', '<meta name="description"', '<link rel="canonical"', '<meta property="og:type" content="website"', '<meta property="og:url"', '<meta name="twitter:card"')

  foreach ($required in $requiredTags) {
    Test-Contains -Html $html -Needle $required -Context $page
  }

  if ($html -notlike '*tel:3175142861*' -and $html -notlike '*tel:+13175142861*') {
    $failures.Add("$page missing phone link")
  }

  foreach ($requiredNav in @('/lawn-care-indianapolis-in', '/lawn-care-tips-indianapolis-in', '/lawn-care-products', '/privacy-policy')) {
    Test-Contains -Html $html -Needle $requiredNav -Context $page
  }

  Test-JsonLd -Html $html -Context $page
}

# Suburb pages are deliberately written with unique copy per city, so this
# checks the structures that must exist rather than shared boilerplate text.
foreach ($page in $locationPages) {
  $html = Get-Content -Raw -LiteralPath (Join-Path $root $page)
  foreach ($required in @('Request a Free Quote', 'FAQPage', 'BreadcrumbList')) {
    Test-Contains -Html $html -Needle $required -Context $page
  }
}

$publicHtmlFiles = Get-ChildItem -LiteralPath $root -Filter '*.html' | Where-Object { $_.Name -notlike 'google*.html' }
foreach ($htmlFile in $publicHtmlFiles) {
  $html = Get-Content -Raw -LiteralPath $htmlFile.FullName
  if ($html -match '<style\b') {
    $failures.Add("$($htmlFile.Name) should not include inline <style> blocks")
  }
  if ($html -match '\sstyle=') {
    $failures.Add("$($htmlFile.Name) should not include inline style attributes")
  }
  if ($html -match '\son[a-z]+=') {
    $failures.Add("$($htmlFile.Name) should not include inline event handlers")
  }
  if ($html -match '<script(?![^>]*type="application/ld\+json")(?![^>]*\ssrc=)[^>]*>') {
    $failures.Add("$($htmlFile.Name) should not include inline executable scripts")
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

$reviewsPagePath = Join-Path $root 'reviews.html'
if (Test-Path -LiteralPath $reviewsPagePath) {
  $reviewsHtml = Get-Content -Raw -LiteralPath $reviewsPagePath
  Test-Contains -Html $reviewsHtml -Needle 'https://g.page/r/Cd_GEPdH7Mj-EAE/review' -Context 'reviews.html'
  if ($reviewsHtml -like '*https://www.google.com/search?q=Indy+Mow+Masters+reviews*') {
    $failures.Add('reviews.html should not use the generic Google review search link')
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

  $slug = $page -replace '\.html$', ''
  if ($index -notlike "*href=`"/$slug`"*") {
    $failures.Add("index.html does not link to /$slug")
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

foreach ($required in @('FAQPage', 'Frequently Asked Questions', 'name="lead_source"', 'name="_gotcha"', 'sms:3175142861', 'mobile-sticky-cta', 'data-service-quote-form')) {
  Test-Contains -Html $index -Needle $required -Context 'index.html'
}

# NOTE: index.html carries first-party review/aggregateRating markup by choice.
# Google ignores self-serving LocalBusiness review markup for rich results
# (it is not a penalty), so this is allowed but the reviews must stay real:
# every marked-up review has to also appear as visible text on the page.
$markedUpReviews = [regex]::Matches($index, '"reviewBody":\s*"(?<body>[^"]+)"')
foreach ($reviewMatch in $markedUpReviews) {
  $body = $reviewMatch.Groups['body'].Value
  $snippet = $body.Substring(0, [Math]::Min(40, $body.Length))
  if ($index -notlike "*$snippet*".Replace('"', '')) {
    $failures.Add("index.html marks up a review not visible on the page: $snippet")
  }
}

Test-JsonLd -Html $index -Context 'index.html'

$sitemap = Get-Content -Raw -LiteralPath (Join-Path $root 'sitemap.xml')
foreach ($page in $expectedPages) {
  if ($page -in @('lawn-care-indianapolis-in.html', 'lawn-care-tips-indianapolis-in.html', 'best-grass-height-indianapolis-in.html', 'weed-control-tips-indianapolis-in.html', 'lawn-care-products.html', 'privacy-policy.html')) {
    continue
  }

  $slug = $page -replace '\.html$', ''
  if ($sitemap -notlike "*https://www.indymowmasters.com/$slug<*" -and $sitemap -notlike "*https://www.indymowmasters.com/$slug</loc>*") {
    $failures.Add("sitemap.xml missing /$slug")
  }
  if ($sitemap -like "*$page*") {
    $failures.Add("sitemap.xml should use extensionless URL for $page")
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

foreach ($required in @('"source": "/products"', '"source": "/amazon-products"')) {
  Test-Contains -Html $vercel -Needle $required -Context 'vercel.json'
}

foreach ($required in @('"source": "/privacy-policy"', '"destination": "/privacy-policy.html"')) {
  Test-Contains -Html $vercel -Needle $required -Context 'vercel.json'
}

foreach ($required in @('Content-Security-Policy', "style-src-attr 'none'", "script-src-attr 'none'", "object-src 'none'", 'connect-src ''self'' https://formspree.io')) {
  Test-Contains -Html $vercel -Needle $required -Context 'vercel.json'
}

# Every public page (except marketing pages with rewrites already covered above)
# must be reachable extensionless via a rewrite.
foreach ($page in $expectedPages) {
  $slug = $page -replace '\.html$', ''
  Test-Contains -Html $vercel -Needle "`"source`": `"/$slug`"" -Context 'vercel.json'
}

# Quote forms must actually submit somewhere and carry named fields.
$formPages = @(
  'lawn-mowing-indianapolis.html',
  'leaf-cleanup.html',
  'gutter-cleaning.html',
  'yard-cleanup-indianapolis.html',
  'weed-pulling-indianapolis.html',
  'mulch-installation-indianapolis.html',
  'drainage-cleanup-indianapolis.html'
)
foreach ($page in $formPages) {
  $html = Get-Content -Raw -LiteralPath (Join-Path $root $page)
  foreach ($required in @('action="https://formspree.io/', 'method="POST"', 'name="name"', 'name="phone"', 'name="address"', 'name="_gotcha"', 'data-service-quote-form')) {
    Test-Contains -Html $html -Needle $required -Context "$page (quote form)"
  }
}

if ($vercel -like "*'unsafe-inline'*") {
  $failures.Add("vercel.json CSP should not include 'unsafe-inline'")
}

# The retired leaf page must 301 to the consolidated /leaf-cleanup URL so the
# two pages never compete for the same query again.
foreach ($required in @('"redirects"', '"source": "/leaf-cleanup-indianapolis"', '"destination": "/leaf-cleanup"', '"permanent": true')) {
  Test-Contains -Html $vercel -Needle $required -Context 'vercel.json (leaf redirect)'
}

# Seasonal pages: published pricing, the fall promo, and the qualifying
# form fields are the whole point of these pages — guard all three.
$gutterPath = Join-Path $root 'gutter-cleaning.html'
if (Test-Path -LiteralPath $gutterPath) {
  $gutter = Get-Content -Raw -LiteralPath $gutterPath
  foreach ($required in @(
    '<title>Gutter Cleaning Indianapolis IN | From $99 | 1-Story Homes | Indy Mow Masters</title>',
    '<link rel="canonical" href="https://www.indymowmasters.com/gutter-cleaning" />',
    '1-Story Homes Only',
    'promo-banner',
    'Book Your <em>October &amp; November</em>',
    'name="preferred_timing"',
    'October — Fall Special',
    'process-steps',
    'BreadcrumbList',
    'FAQPage'
  )) {
    Test-Contains -Html $gutter -Needle $required -Context 'gutter-cleaning.html'
  }

  foreach ($price in @('<sup>$</sup>99', '<sup>$</sup>129', '<sup>$</sup>159')) {
    if ($gutter -notlike "*$price*") {
      $failures.Add("gutter-cleaning.html missing tier price $price")
    }
  }

  $h1Count = ([regex]::Matches($gutter, '<h1[\s>]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
  if ($h1Count -ne 1) {
    $failures.Add("gutter-cleaning.html should contain exactly one H1, found $h1Count")
  }

  $stepCount = ([regex]::Matches($gutter, '<div class="step">')).Count
  if ($stepCount -ne 4) {
    $failures.Add("gutter-cleaning.html should have a 4-step process card, found $stepCount steps")
  }
}

$leafPath = Join-Path $root 'leaf-cleanup.html'
if (Test-Path -LiteralPath $leafPath) {
  $leaf = Get-Content -Raw -LiteralPath $leafPath
  foreach ($required in @(
    '<link rel="canonical" href="https://www.indymowmasters.com/leaf-cleanup" />',
    'promo-banner',
    'Mow-Over Mulching',
    'Bag &amp; Leave',
    'Full Haul Away',
    'Leaf Volume Changes Everything',
    'Early List',
    'name="leaf_coverage"',
    'name="preferred_timing"',
    'BreadcrumbList',
    'FAQPage'
  )) {
    Test-Contains -Html $leaf -Needle $required -Context 'leaf-cleanup.html'
  }

  # Full tier matrix: every published price must be present.
  foreach ($price in @('>$40<', '>$60<', '>$80<', '>$99<', '>$149<', '>$199<', '>$169<', '>$249<', '>$349<')) {
    if ($leaf -notlike "*$price*") {
      $failures.Add("leaf-cleanup.html missing tier price $price")
    }
  }

  # Very large properties are quote-only on all three tiers.
  $quoteCells = ([regex]::Matches($leaf, '<td class="is-quote">Quote</td>')).Count
  if ($quoteCells -ne 3) {
    $failures.Add("leaf-cleanup.html should have a Quote cell for Very Large on all 3 tiers, found $quoteCells")
  }

  # Every tier carries its own pricing-varies note.
  $variesCount = ([regex]::Matches($leaf, 'Pricing varies by leaf volume')).Count
  if ($variesCount -lt 3) {
    $failures.Add("leaf-cleanup.html should have a pricing-varies note on all 3 tiers, found $variesCount")
  }

  foreach ($coverage in @('Light —', 'Moderate —', 'Heavy —', 'Very Heavy —')) {
    Test-Contains -Html $leaf -Needle $coverage -Context 'leaf-cleanup.html (coverage dropdown)'
  }

  $h1Count = ([regex]::Matches($leaf, '<h1[\s>]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
  if ($h1Count -ne 1) {
    $failures.Add("leaf-cleanup.html should contain exactly one H1, found $h1Count")
  }
}

$hotmPath = Join-Path $root 'house-of-the-month.html'
if (Test-Path -LiteralPath $hotmPath) {
  $hotm = Get-Content -Raw -LiteralPath $hotmPath
  foreach ($required in @(
    '<link rel="canonical" href="https://www.indymowmasters.com/house-of-the-month" />',
    'id="featured"',
    'id="past-winners"',
    'id="nominate"',
    'name="whose_yard"',
    'name="why_nominated"',
    'data-service-quote-form',
    'BreadcrumbList',
    'FAQPage'
  )) {
    Test-Contains -Html $hotm -Needle $required -Context 'house-of-the-month.html'
  }

  $h1Count = ([regex]::Matches($hotm, '<h1[\s>]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
  if ($h1Count -ne 1) {
    $failures.Add("house-of-the-month.html should contain exactly one H1, found $h1Count")
  }

  # Only inspect markup that actually renders — the page carries commented-out
  # fill-in templates for publishing a new month, and those are not live.
  $hotmLive = [regex]::Replace($hotm, '<!--.*?-->', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)

  # Video embeds must use the privacy-preserving nocookie domain, and any
  # iframe host has to be allowed by frame-src or it silently fails to load.
  foreach ($iframe in [regex]::Matches($hotmLive, '<iframe\b[^>]*src="(?<src>[^"]+)"[^>]*>')) {
    $src = $iframe.Groups['src'].Value
    if ($src -notlike 'https://www.youtube-nocookie.com/*') {
      $failures.Add("house-of-the-month.html iframe must use youtube-nocookie.com, found: $src")
    }
    if ($iframe.Value -notlike '*title=*') {
      $failures.Add('house-of-the-month.html iframe is missing a title attribute')
    }
  }

  # Placeholder media must never ship as a broken <img> reference.
  foreach ($img in [regex]::Matches($hotmLive, '<img\b[^>]*src="(?<src>[^"]+)"')) {
    $src = $img.Groups['src'].Value
    if ($src -notmatch '^https?://' -and $src -notmatch '^data:') {
      $localName = $src.TrimStart('/')
      if (-not (Test-Path -LiteralPath (Join-Path $root $localName))) {
        $failures.Add("house-of-the-month.html references a missing image: $src")
      }
    }
  }
}

# Any page embedding an iframe needs a frame-src that permits its host.
$iframePages = $publicHtmlFiles | Where-Object {
  $live = [regex]::Replace((Get-Content -Raw -LiteralPath $_.FullName), '<!--.*?-->', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $live -match '<iframe'
}
if ($iframePages -and $vercel -notlike '*frame-src*') {
  $failures.Add('vercel.json CSP needs a frame-src directive: ' + (($iframePages | ForEach-Object { $_.Name }) -join ', ') + ' embed iframes that default-src would block')
}

# The new phone number must be everywhere; the old one nowhere.
foreach ($htmlFile in $publicHtmlFiles) {
  $html = Get-Content -Raw -LiteralPath $htmlFile.FullName
  if ($html -like '*3173860400*' -or $html -like '*386-0400*') {
    $failures.Add("$($htmlFile.Name) still references the retired phone number")
  }
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
