# Pindou V2.0-B1 — Conversation image copies for diagnostic reproduction

Important: The two chart images in this ZIP are the copies available from this ChatGPT conversation. Their pixel dimensions are 1080 x 1254. They are not guaranteed to be the exact original images that were uploaded to Pindou in the iPhone screenshots (reported as IMG_7250.jpeg / IMG_7252.jpeg, 1440 x 1672). These copies may have been resized or transformed by the chat upload pipeline. Do NOT claim an exact original-file replay or byte-identical reproduction from them.

Files:
- duck_chat_copy.png — MARD duck chart, visually 50 x 50, reference 139 beads, 8 colors.
- teapot_chat_copy.png — MARD pink teapot chart, visually 50 x 50, reference 1333 beads, 6 colors.
- duck_failure_iphone.png — screenshot of grid-spacing/skew recognition failure.
- teapot_failure_iphone.png — screenshot of ambiguous-grid recognition failure.

Use these as immediate diagnostics/regression inputs. For exact reproduction of the user's failures, additionally ask for the native IMG_7250.jpeg and IMG_7252.jpeg files or images exported without resizing from the phone. Do not hardcode any known counts or dimensions. Distinguish tests on these copies from tests on originals.

Reference legends (validation-only):
Duck: H2 70, A4 44, C3 16, C9 4, A7 2, A3 1, H7 1, A5 1.
Teapot: H18 635, C15 272, E3 266, E10 112, A17 25, C3 23.
