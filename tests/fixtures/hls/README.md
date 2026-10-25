# Synthetic playback fixture

This three-second green video with a test tone was generated locally with FFmpeg. It contains no provider content, credentials, or captured stream URLs. Browser tests serve it through intercepted requests to exercise the actual HLS playback code and Content Security Policy.

To regenerate from the project root:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=0x20372b:s=320x180:r=24 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 3 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -g 24 -c:a aac -b:a 48k -f hls -hls_time 1 -hls_list_size 0 -hls_segment_filename tests/fixtures/hls/segment%d.ts tests/fixtures/hls/index.m3u8
```
