#!/usr/bin/env python3
"""Stamp the shared header, footer and sticky CTA into every page.

The site is plain static HTML with no build step, so the shared chrome is
duplicated in each file between marker comments:

    <!-- lx:header --> ... <!-- /lx:header -->
    <!-- lx:footer --> ... <!-- /lx:footer -->

Edit HEADER / FOOTER below, then run:  python3 scripts/apply-chrome.py
Only the text between the markers is replaced; page content is untouched.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = {"goldknock-coming-soon.html", "thank-you.html"}

HEADER = """<a class="lx-skip" href="#main">Skip to content</a>
<div class="lx-topbar promo-banner"><strong>Gutter cleaning from $99</strong> &mdash; one-story homes, cleared and flush-tested. Booking now before the freeze. <a href="/gutter-cleaning">See pricing &rarr;</a></div>
<header class="lx-header">
  <div class="lx-wrap lx-header__in">
    <a class="lx-logo" href="/" aria-label="Indy Mow Masters home">
      <img src="/logo-128.png" alt="" width="128" height="128" decoding="async" />
      <span>Indy Mow Masters<small>Your Yard. Done Right.</small></span>
    </a>
    <nav class="lx-nav" id="lx-nav" aria-label="Main">
      <a href="/lawn-mowing-indianapolis">Lawn Mowing</a>
      <a href="/gutter-cleaning" class="lx-nav__hot">Gutter Cleaning</a>
      <a href="/mulch-installation-indianapolis">Mulching</a>
      <a href="/leaf-cleanup">Leaf Cleanup</a>
      <a href="/lawn-care-indianapolis-in">Services</a>
      <a href="/lawn-care-tips-indianapolis-in">Tips</a>
      <a href="/lawn-care-products">Products</a>
      <a href="/spring-cleanup" class="lx-nav__pill">Spring 2027 List</a>
    </nav>
    <div class="lx-header__side">
      <a class="lx-phone" href="tel:3175142861" aria-label="Call Indy Mow Masters at 317-514-2861"><svg aria-hidden="true"><use href="/icons.svg#phone"/></svg>(317) 514-2861</a>
      <button class="lx-burger" type="button" aria-controls="lx-nav" aria-expanded="false" aria-label="Menu"><span></span></button>
    </div>
  </div>
</header>"""

FOOTER = """<div class="lx-sticky mobile-sticky-cta" role="navigation" aria-label="Quick contact options">
  <a href="tel:3175142861"><svg aria-hidden="true"><use href="/icons.svg#phone"/></svg>Call</a>
  <a href="sms:3175142861"><svg aria-hidden="true"><use href="/icons.svg#message"/></svg>Text</a>
  <a href="{QUOTE}">Free Quote</a>
</div>
<footer class="lx-footer">
  <div class="lx-wrap">
    <div class="lx-footer__grid">
      <div class="lx-footer__brand">
        <img src="/logo-128.png" alt="Indy Mow Masters" width="128" height="128" loading="lazy" decoding="async" />
        <p>Owner-operated lawn care, gutter cleaning and landscape work for Indianapolis and the west side. Flat rates, no contracts.</p>
        <a class="lx-footer__tel" href="tel:3175142861">(317) 514-2861</a>
        <p>Call or text &middot; Mon&ndash;Sat 8am&ndash;6pm<br>Licensed &amp; insured &middot; Locally owned</p>
      </div>
      <div>
        <h2>Services</h2>
        <ul>
          <li><a href="/gutter-cleaning">Gutter Cleaning Indianapolis</a></li>
          <li><a href="/lawn-mowing-indianapolis">Lawn Mowing Indianapolis</a></li>
          <li><a href="/mulch-installation-indianapolis">Mulch Installation</a></li>
          <li><a href="/leaf-cleanup">Leaf Cleanup</a></li>
          <li><a href="/yard-cleanup-indianapolis">Yard Cleanup</a></li>
          <li><a href="/weed-pulling-indianapolis">Weed Pulling</a></li>
          <li><a href="/drainage-cleanup-indianapolis">Drainage Cleanup</a></li>
          <li><a href="/overgrown-lawn-mowing-indianapolis">Overgrown Lawn Mowing</a></li>
          <li><a href="/one-time-lawn-mowing-indianapolis">One-Time Lawn Mowing</a></li>
        </ul>
      </div>
      <div>
        <h2>Service Areas</h2>
        <ul>
          <li><a href="/lawn-mowing-indianapolis">Indianapolis</a></li>
          <li><a href="/lawn-mowing-avon">Avon</a></li>
          <li><a href="/lawn-mowing-plainfield">Plainfield</a></li>
          <li><a href="/lawn-mowing-brownsburg">Brownsburg</a></li>
          <li><a href="/lawn-mowing-speedway">Speedway</a></li>
          <li>Whitestown &middot; Zionsville</li>
          <li>Fishers &middot; Carmel</li>
          <li>Meridian Hills</li>
        </ul>
      </div>
      <div>
        <h2>Resources</h2>
        <ul>
          <li><a href="/spring-cleanup">2027 Spring Cleanup Sign-Up</a></li>
          <li><a href="/lawn-care-indianapolis-in">All Lawn Care Services</a></li>
          <li><a href="/lawn-care-tips-indianapolis-in">Lawn Care Tips</a></li>
          <li><a href="/best-grass-height-indianapolis-in">Best Grass Height</a></li>
          <li><a href="/weed-control-tips-indianapolis-in">Weed Control Tips</a></li>
          <li><a href="/lawn-care-products">Lawn Care Products</a></li>
          <li><a href="/house-of-the-month">House of the Month</a></li>
          <li><a href="/reviews">Leave a Review</a></li>
        </ul>
      </div>
    </div>
    <div class="lx-footer__bar">
      <p>&copy; <span data-year>2026</span> Indy Mow Masters &middot; Indianapolis, IN</p>
      <p><a href="/privacy-policy">Privacy Policy</a></p>
    </div>
  </div>
</footer>"""


def stamp(html: str, name: str, block: str) -> str:
    pattern = re.compile(r"<!-- lx:%s -->.*?<!-- /lx:%s -->" % (name, name), re.S)
    if not pattern.search(html):
        raise ValueError("missing lx:%s markers" % name)
    return pattern.sub(lambda _: "<!-- lx:%s -->\n%s\n<!-- /lx:%s -->" % (name, block, name), html, count=1)


def main() -> int:
    failed = False
    for path in sorted(ROOT.glob("*.html")):
        if path.name in SKIP or path.name.startswith("google"):
            continue
        html = path.read_text(encoding="utf-8")
        # "Free Quote" jumps to the page's own form when it has one.
        if 'id="contact"' in html:
            quote = "#contact"
        elif 'id="quoteForm"' in html:
            quote = "#quoteForm"
        else:
            quote = "/#contact"
        try:
            out = stamp(stamp(html, "header", HEADER), "footer", FOOTER.replace("{QUOTE}", quote))
        except ValueError as err:
            print("SKIPPED %s: %s" % (path.name, err))
            failed = True
            continue
        if out != html:
            path.write_text(out, encoding="utf-8")
            print("updated %s" % path.name)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
