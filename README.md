# Kim's Clip Nudger (CABP Light Nudge)

A Max for Live MIDI effect for Ableton Live 12. It moves the **Arrangement MIDI clips** on its track earlier or later by a number of milliseconds, without using Track Delay. That means it adds **no latency** to anything: it only edits the arrangement when you click, and the MIDI passes straight through.

Built for the Charlotte Adigéry & Bolis Pupul tour to line up the lighting-desk MIDI.

## Use
1. Put `CABP Light Nudge v2.amxd` on the MIDI track that sends to the lighting desk.
2. Stop playback (the device won't move clips while playing).
3. `< EARLIER` / `LATER >` moves the clips by one step (default 1 ms) per click. Fast clicks are added up.
4. Or type a value (for example -30) and press `SET`.
5. `NOW` shows the total offset, saved with the set. `BACK TO 0` returns everything to the original position. Cmd+Z also works.
6. `TRACK` moves every clip on the track; `CLIP` moves only the selected clip.

ms are converted to beats using the tempo. If the song tempo is automated, it reads the tempo at each clip by moving the playhead there.

## How it works
For each clip: it copies the clip to a parking spot after the last clip, deletes the original, copies it back to the new position, and deletes the parking copy (`duplicate_clip_to_arrangement` and `delete_clip`, Live 12). Moving earlier works from the first clip to the last, and moving later from the last to the first, so the clips never overlap.

## Build
`python3 build.py nudge.js "CABP Light Nudge v2.amxd"` wraps the script in a `v8.codebox` and writes the device.

Status: v2. v1 tested 2026-11-07 in the test set (-30 ms set, -29.3 ms measured). v2: all-or-nothing moves (if one clip would go before the song start, nothing moves).

## Test set (no light desk needed)
`CABP Test Rig v2.amxd` builds a test set and acts as a virtual light.

1. Mac: Audio MIDI Setup > MIDI Studio > IAC Driver > "Device is online" (Bus 1).
2. Live: Settings > Link, Tempo & MIDI: turn on **Track** for IAC Driver (Bus 1) as both input and output.
3. File > New Live Set. Drag `CABP Test Rig v2.amxd` onto a MIDI track and press **BUILD TEST SET**. It:
   - turns that track into VIRTUAL LIGHT (input IAC, armed, monitor In),
   - adds LIGHT CUES (note C3) and REF CUES (note D3), both sending to IAC with 8 identical clips, one cue per beat, the first right at the clip start, starting at bar 2,
   - sets 120 BPM and loops the 16 bars.
4. Drag `CABP Light Nudge v2.amxd` onto LIGHT CUES. Press play.
5. The LIGHT and REF squares flash on every cue. **LIGHT vs REF (ms)** shows how much earlier (negative) or later the light cues arrive than the reference, averaged over the last 8 cues. It starts around 0.
6. Stop, click `< EARLIER` 10 times, and play: it should read about -10 while REF keeps flashing on the beat. `BACK TO 0` returns it to about 0.

REF stands for "everything else": it's never nudged, so it shows that only the light clips moved. Timing is measured on arrival over IAC, so expect ±1–2 ms of jitter.
