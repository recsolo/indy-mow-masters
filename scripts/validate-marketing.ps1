$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$expectedPages = @(
  'lawn-mowing-indianapolis.html',
  'lawn-mowing-avon.html',
  'lawn-mowing-plainfield.html',
  'lawn-mowing-brownsburg.html',
  'lawn-mowing-speedway.html',
  'reviews.html'
)

$failures = New-Object System.Collections.Generic.List[string]

foreach ($page in $expectedPages) {
  $path = Join-Path $root $page
  if (-not (Test-Path -LiteralPath $path)) {
    $failures.Add("Missing page: $page")
    continue
  }

  $html = Get-Content -Raw -LiteralPath $path
  foreach ($required in @('<title>', '<meta name="description"', '<link rel="canonical"', 'tel:3173860400')) {
    if ($html -notlike "*$required*") {
      $failures.Add("$page missing $required")
    }
  }
}

$index = Get-Content -Raw -LiteralPath (Join-Path $root 'index.html')
foreach ($page in $expectedPages) {
  if ($index -notlike "*$page*") {
    $failures.Add("index.html does not link to $page")
  }
}

$sitemap = Get-Content -Raw -LiteralPath (Join-Path $root 'sitemap.xml')
foreach ($page in $expectedPages) {
  if ($sitemap -notlike "*https://www.indymowmasters.com/$page*") {
    $failures.Add("sitemap.xml missing $page")
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
  exit 1
}

Write-Output "Marketing page validation passed for $($expectedPages.Count) pages."
