# Kim's Clip Nudger (CABP Light Nudge)

A Max for Live MIDI effect for Ableton Live 12. It moves the **Arrangement MIDI clips** on its track earlier or later by a number of milliseconds, without using Track Delay. That means it adds **no latency** to anything: it only edits the arrangement when you click, and the MIDI passes straight through.

Built for the Charlotte Adigéry & Bolis Pupul tour to line up the lighting-desk MIDI.

## Use
1. Put `CABP Light Nudge v1.amxd` on the MIDI track that sends to the lighting desk.
2. Stop playback (the device won't move clips while playing).
3. `< EARLIER` / `LATER >` moves the clips by one step (default 1 ms) per click. Fast clicks are added up.
4. Or type a value (for example -30) and press `SET`.
5. `NOW` shows the total offset, saved with the set. `BACK TO 0` returns everything to the original position. Cmd+Z also works.
6. `TRACK` moves every clip on the track; `CLIP` moves only the selected clip.

ms are converted to beats using the tempo. If the song tempo is automated, it reads the tempo at each clip by moving the playhead there.

## How it works
For each clip: it copies the clip to a parking spot after the last clip, deletes the original, copies it back to the new position, and deletes the parking copy (`duplicate_clip_to_arrangement` and `delete_clip`, Live 12). Moving earlier works from the first clip to the last, and moving later from the last to the first, so the clips never overlap.

## Build
`python3 build.py nudge.js "CABP Light Nudge v1.amxd"` wraps the script in a `v8.codebox` and writes the device.

Status: v1, not tested in Live yet.
