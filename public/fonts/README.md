# Self-hosted UI fonts

English letters and numerals use Poppins first; Korean uses Pretendard Variable.
The global stack is `Poppins, "Pretendard Variable", system-ui, sans-serif`.
Schedule exports embed the same font files under private snapshot family names.
Poppins has separate static weights 100–900; Pretendard supports variable weights 100–900.

Poppins Latin is distributed from `@fontsource/poppins` 5.3.0 (package version),
https://registry.npmjs.org/@fontsource/poppins/-/poppins-5.3.0.tgz.
Its SIL Open Font License is included in `poppins-5.3.0/LICENSE`.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `poppins-5.3.0/poppins-latin-100-normal.woff2` | 7484 | `a9220f99b916978e5d7934b73be5ab91444871ba52a89032e4dd90e42b0a96e1` |
| `poppins-5.3.0/poppins-latin-200-normal.woff2` | 7932 | `6f0c572590421075878908e0b380c5a6d404f72aa7d6d125385943be658f8399` |
| `poppins-5.3.0/poppins-latin-300-normal.woff2` | 7840 | `78bc3aa78faec288bbb3bf26c9a0fa4eb67b1e69da94a17233c5cab60525efdb` |
| `poppins-5.3.0/poppins-latin-400-normal.woff2` | 7884 | `7d93459d86585bfcdbb7e0376056226adb25821ee54b96236fe2123e9560929f` |
| `poppins-5.3.0/poppins-latin-500-normal.woff2` | 7748 | `cd36de204aca2d5fa263a731f7c20009b5e3d754ba1f1e03c33e93a48f3e7446` |
| `poppins-5.3.0/poppins-latin-600-normal.woff2` | 8000 | `f4e80d9dfd374d02989b87a27b5ed4cb78fbb177c27f1478e9a8b0afb7513149` |
| `poppins-5.3.0/poppins-latin-700-normal.woff2` | 7816 | `9338e65fc077355c7a87ae0d64cc101e23b9bf8ad78ae65f0f319c857311b526` |
| `poppins-5.3.0/poppins-latin-800-normal.woff2` | 7824 | `60bf0aba6526436f3930c58c12047687fbb6bff4dd180cce4613458ed3439ea2` |
| `poppins-5.3.0/poppins-latin-900-normal.woff2` | 7632 | `17ea10196a490a8d3b8da162c7d4af9c301c5229f70af90dad6fa33eb951d83f` |
| `pretendard-1.3.9/PretendardVariable.woff2` | 2057688 | `9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4` |

Pretendard source: https://github.com/orioncactus/pretendard/tree/v1.3.9; license included in `pretendard-1.3.9/LICENSE`. The retained Inter assets are no longer referenced by the UI or snapshot renderer.
