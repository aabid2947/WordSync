# Bundled data

**`words-en.txt`** — the top ~10k English words, frequency-ordered (line index = rank).
Used as WordSync's base vocabulary: cold-start suggestions and spelling-correction
targets, kept separate from the user's personal dictionary.

Source: [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english)
(the "no-swears" list; word data is public-domain, derived from the Google Web
Trillion Word Corpus). Regenerate with:

```
node scripts/fetch-wordlist.mjs
```
