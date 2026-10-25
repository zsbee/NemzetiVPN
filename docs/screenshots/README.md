# README screenshots

These images show the actual browser interface at 1920 × 1080 with synthetic
programme data and a reserved example email address. No NVT account, broadcast
picture, session cookies, or provider playback URLs are used. The programme guide
and detail captures intentionally leave the playback picture empty.

To refresh them, start the preview with `npm run dev`, then run:

```sh
node scripts/capture-readme.mjs
```

An optional local preview URL can be supplied as the first argument. The capture
script intercepts provider requests and blocks requests to other origins. It
checks channel focus, loaded logos, programme data, and detail content before
capturing each screen.
