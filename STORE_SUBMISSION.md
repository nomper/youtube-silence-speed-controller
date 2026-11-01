# Store Submission Guide (Chrome + Edge)

Same package works for both. Reuse `STORE_LISTING.md` (JP/EN) for text.

## Package
- File: `youtube-silence-speed-controller-0.1.12.zip` (MV3, no keys in package)
- Contents: manifest.json, background.js, content.js, shared.js, popup.*, options.*, icons/
- Exclude: .git, .gitignore, README.md, AGENTS.md, STORE_*.md, *.zip

## Google: Chrome Web Store
- Console: https://chrome.google.com/webstore/devconsole
- Account: Chrome Web Store developer registration ($5 one-time, done)
- Steps: New Item -> upload ZIP -> fill listing (short + detailed JP/EN) -> screenshots 1280x800 (min 1) -> category, language -> privacy tab (storage only, no data collection) -> Submit for review
- Review: usually a few days; policy mails come to the developer email

## Microsoft: Edge Add-ons
- Portal: https://partner.microsoft.com/dashboard (Microsoft Edge program)
- Account: free Microsoft developer account (company verification only if needed)
- Steps: New extension -> upload same ZIP -> store listing (reuse JP/EN) -> screenshots 1280x800 or 640x400 -> properties/privacy notes -> Submit for certification
- Review: typically 1-3 business days; same `storage` permission justification

## Asset checklist
- [x] Icons 16/32/48/128 (+disabled variants in package)
- [x] Short + detailed description JP/EN
- [ ] Screenshots: YouTube watch page + popup meter + options page
- [ ] Promo tile 440x280 (Edge optional, Chrome recommended)
- [x] Privacy note: local-only, no servers/analytics
- [x] Support contact + homepage (GitHub repo URL)

## Links
- GitHub: https://github.com/nomper/youtube-silence-speed-controller
