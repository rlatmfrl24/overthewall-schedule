# Bundled fonts

The app serves these unmodified, full variable WOFF2 files from versioned URLs.
Both include weights 400–900. Font updates must use a new version directory;
existing URLs receive an immutable one-year cache policy.

| Asset | Version | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `inter-4.1/InterVariable.woff2` | Inter 4.1 | 352240 | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| `pretendard-1.3.9/PretendardVariable.woff2` | Pretendard 1.3.9 | 2057688 | `9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4` |

Sources:

- [Inter file at v4.1](https://raw.githubusercontent.com/rsms/inter/v4.1/docs/font-files/InterVariable.woff2), [license](https://raw.githubusercontent.com/rsms/inter/v4.1/LICENSE.txt), distributed alongside the file as `LICENSE.txt`.
- [Pretendard file at v1.3.9](https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2), [license](https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/LICENSE), distributed alongside the file as `LICENSE`.

The normal UI uses Inter first, then Pretendard Variable for unsupported glyphs,
then system fonts. Snapshot export validates and embeds these same bytes under
private snapshot family names so late network fonts cannot change an export.
The two files total 2,409,928 bytes before HTTP transfer overhead. Actual browser
transfer and export measurements belong in `docs/font-consistency-review.md`.
