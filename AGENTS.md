# AGENTS Instructions

- Keep a single canonical release version on the last line of this file in the format `Release Version: 0.1.N`.
- Use `0.1` as the fixed major/minor version for this workspace and a monotonically increasing integer for the revision `N`.
- Increment the revision `N` by 1 every time a code, behavior, settings, manifest, UI, or runtime logic change is made in this workspace.
- Do not increment `N` for comment-only, documentation-only, or formatting-only changes that do not alter runtime behavior.
- When a change is made, update the release version in the same edit set before finishing the task and keep it aligned with `manifest.json`.

## Extension release packaging

- Put locally generated release outputs in `release\artifacts\`; do not commit those outputs.
- The stable signing key is a PEM in that directory. Never print, commit, upload, or include the key in an archive; restrict its ACL to the current user.
- Create the store submission ZIP with `manifest.json` at its root and only the extension runtime files. Exclude `.git`, `release`, private keys, and CRX files.
- Upload the `*-source.zip` file to Chrome Web Store or Microsoft Edge Add-ons. A signed `.crx` is for local distribution or validation and is not a store-upload artifact.
- Before delivery, verify ZIP integrity, expected files, manifest location, secret/path exclusions, CRX magic (`Cr24`), version (`3`), signature, and embedded ZIP; check for unintended tracked source changes.
- For unpacked browser testing, extract the submission ZIP to a clean directory such as `release\unpacked\youtube-silence-speed-controller-v0.1.12\` and select that directory, not the repository root. The repository root contains the signing key under `release\artifacts\`, which causes Edge to warn that the extension contains a key. Confirm the extracted files match the ZIP and contain no private keys.
- An unpacked extension's ID can change when its directory changes and may differ from the signed CRX or store-assigned ID. Replacing an unpacked installation can also remove its stored settings.
- Browser load success and absence of an extension error do not verify behavior on a YouTube watch page; test that separately when authorized.
- Store publication requires an authorized user to complete the developer registration, terms, listing/privacy details, upload, and review submission. Do not perform those external actions without an explicit request.

Release Version: 0.1.15
