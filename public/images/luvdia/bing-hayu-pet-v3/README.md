# Bing Hayu recovery pet v3

Approved LuvDia fan-art animation from the current chat, generated with built-in Image Gen.
The active set has six scenes with five distinct drawn cuts each. The former duo-snack scene is excluded.

Web delivery: 288 x 288 RGBA lossless WebP. Each animated file loops infinitely every 3000 ms.
The corresponding `-still.webp` is F00 for the site animation-off setting and reduced motion.
`assets.json` records source PNG hashes, native F00 bounds, output hashes, frame counts and validation.

Only delivery-size conversion was applied: each approved 1254px PNG was scaled by
`ffmpeg -i INPUT.png -vf scale=288:288:flags=lanczos -frames:v 1 OUTPUT.png`.
Pillow assembled the scaled PNGs without further pixel edits, using the approved v3 timeline.
Decoded visible RGB, alpha and every duration were compared with the scaled source frames.

Keep the native F00 bounds when displaying a scene; do not auto-center individual frames.
Full-resolution PNGs and APNG masters remain in the preserved v3 artwork bundle.
