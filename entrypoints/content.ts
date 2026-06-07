// Content script — runs in every frame on every site (isolated world).
// CP4/CP5 implement field detection, the fast-path lookup, and the Shadow-DOM
// suggestion strip. Everything here must fail silent and never break the host page.
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    // Intentionally empty for CP0 — scaffold only.
  },
});
