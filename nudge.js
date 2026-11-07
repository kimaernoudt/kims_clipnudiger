// CABP LIGHT NUDGE - moves Arrangement MIDI clips on this track earlier/later in ms.
// Edits the arrangement only when you click: no delay, no latency, MIDI passes straight through.
// With tempo automation every clip moves exactly X ms at its own tempo, and inside clips where
// the tempo changes, every cue is corrected on its own (v7).
inlets = 1; outlets = 1;
var stepMs = 1, scope = 0, total = 0, busy = false, job = null;
var pending = 0, tempoCache = null;   // clicks are added up and run together

function setstep(v) { stepMs = Math.max(0.1, Number(v)); }
// NOW is also the type-in field: typing a value moves the clips there automatically.
// While the set loads, NOW just restores the saved total (ready comes 1.5 s after load).
var ready = false;
function setready() { ready = true; }
function settarget(v) {
  v = Number(v);
  if (!ready) { total = v; return; }
  queue(round(v - total - pending, 2));
}
function setscope(v) { scope = Number(v); tempoCache = null; }
function back() { queue(-stepMs); }          // earlier
function fwd() { queue(stepMs); }            // later
function reset() {
  if (Math.abs(total + pending) < 0.001) { status("Already at 0 ms."); return; }
  queue(-(total + pending));
}
// clicks are collected: the move happens once, 400 ms after the last click,
// so 10 fast clicks = one move of 10 ms instead of 10 separate moves
// Timing goes through Max objects ([delay] -> [deferlow]) and not a JS Task, so every
// change to the Live set happens on Live's safe low-priority thread (a Task-driven
// move crashed Live in v3/v4).
function queue(d) {
  if (!d) { status("Nothing to move."); return; }
  pending = round(pending + d, 2);
  status("Will move " + pending + " ms...");
  outlet(0, "waitfire", 400);            // [delay] restarts on every click
}
function fire() {
  if (busy) { outlet(0, "waitfire", 200); return; }
  var d = pending; pending = 0;
  if (Math.abs(d) < 0.001) { status("Nothing to move."); outlet(0, "total", total); return; }
  try { start(d); } catch (e) { busy = false; status("ERROR: " + e + " - use Cmd+Z to undo."); }
  if (!busy) outlet(0, "total", total);   // also puts NOW back if the move was refused
}
function status(t) { outlet(0, "status", t); }
function num(api, prop) { return Number(api.get(prop)[0]); }
function ok(api) { return api && api.id && Number(api.id) !== 0; }
function round(x, d) { var m = Math.pow(10, d); return Math.round(x * m) / m; }

function start(dms) {
  var song = new LiveAPI("live_set");
  // works while playing too (Kim, v6). Only risk: a cue sounding at the exact moment of the move
  // can be cut short or skipped once.
  var playing = num(song, "is_playing") === 1;

  var track, items = [];
  if (scope === 1) {
    var c = new LiveAPI("live_set view detail_clip");
    if (!ok(c)) { status("No clip selected."); return; }
    if (num(c, "is_arrangement_clip") !== 1 || num(c, "is_midi_clip") !== 1) { status("Select a MIDI clip in the Arrangement."); return; }
    var p = c.get("canonical_parent");
    track = new LiveAPI("id " + p[p.length - 1]);
    items.push({ id: Number(c.id), start: num(c, "start_time") });
  } else {
    track = new LiveAPI("this_device canonical_parent");
  }
  var tpath = track.unquotedpath;
  var n = track.getcount("arrangement_clips"), trackEnd = 0;
  for (var i = 0; i < n; i++) {
    var a = new LiveAPI(tpath + " arrangement_clips " + i);
    trackEnd = Math.max(trackEnd, num(a, "end_time"));
    if (scope === 0 && num(a, "is_midi_clip") === 1) items.push({ id: Number(a.id), start: num(a, "start_time") });
  }
  if (!items.length) { status("No Arrangement MIDI clips on this track."); return; }
  // earlier: first clip first; later: last clip first -> moved clips never overlap
  items.sort(function (x, y) { return dms < 0 ? x.start - y.start : y.start - x.start; });

  // details per clip: playing range and notes (for the per-cue tempo correction)
  for (var d = 0; d < items.length; d++) {
    var cl = new LiveAPI("id " + items[d].id);
    var it = items[d];
    it.looping = num(cl, "looping") === 1;
    it.marker = num(cl, "start_marker");
    it.lo = it.looping ? num(cl, "loop_start") : it.marker;
    it.hi = it.looping ? num(cl, "loop_end") : num(cl, "end_marker");
    it.end = num(cl, "end_time");
    it.notes = JSON.parse(cl.call("get_notes_extended", 0, 128, 0, 1000000)).notes || [];
    it.notes.sort(function (x, y) { return x.start_time - y.start_time || x.pitch - y.pitch; });
  }

  var tempoParam = new LiveAPI("live_set master_track mixer_device song_tempo");
  var automated = ok(tempoParam) && num(tempoParam, "automation_state") !== 0;
  job = { dms: dms, items: items, tpath: tpath, temp: Math.ceil(trackEnd) + 64,
          automated: automated, home: num(song, "current_song_time"), samples: [], si: 0, round: 1 };
  busy = true;
  var asc = items.slice().sort(function (x, y) { return x.start - y.start; });
  if (!automated) {
    var t = num(song, "tempo");
    for (var k = 0; k < items.length; k++) { items[k].tempo = t; items[k].noteTempo = null; }
    doMoves();
  } else if (cacheFits(asc)) {
    for (var q = 0; q < asc.length; q++) { asc[q].tempo = tempoCache.clips[q].tempo; asc[q].noteTempo = tempoCache.clips[q].noteTempo; }
    doMoves();
  } else if (playing) {
    // reading the tempos needs to park the playhead, which can't happen mid-song
    busy = false; pending = 0;
    status("Tempo automation found: stop playback ONCE so I can read the tempos, then it works while playing.");
    return;
  } else {
    // round 1: tempo at start, middle and end of every clip
    for (var ci = 0; ci < asc.length; ci++) {
      var a = asc[ci];
      job.samples.push({ it: a, kind: "start", pos: a.start });
      if (!a.looping) {
        job.samples.push({ it: a, kind: "mid", pos: (a.start + a.end) / 2 });
        job.samples.push({ it: a, kind: "end", pos: a.end - 0.01 });
      }
    }
    job.asc = asc;
    status("Tempo automation found: reading the tempos (only the first time)...");
    readNextTempo();
  }
}

function sig(asc) { return asc.map(function (a) { return a.notes.length; }).join(","); }
function cacheFits(asc) {
  return tempoCache && tempoCache.scope === scope && tempoCache.clips.length === asc.length && tempoCache.sig === sig(asc);
}

// tempo is automated: park the playhead on each point, wait (via [delay]+[deferlow]), read the tempo
function readNextTempo() {
  var song = new LiveAPI("live_set");
  if (job.si >= job.samples.length) { roundDone(); return; }
  song.set("current_song_time", job.samples[job.si].pos + 0.001);
  outlet(0, "waittempo", 150);
}
function tempotick() {
  if (!job || !busy) return;
  job.samples[job.si].tempo = num(new LiveAPI("live_set"), "tempo");
  job.si++;
  if (job.si % 10 === 0) status("Reading tempos... " + job.si + "/" + job.samples.length);
  readNextTempo();
}
function roundDone() {
  var asc = job.asc, k, s;
  if (job.round === 1) {
    var by = {};
    for (k = 0; k < job.samples.length; k++) { s = job.samples[k]; (s.it.r1 = s.it.r1 || {})[s.kind] = s.tempo; }
    // round 2: clips whose tempo changes inside -> the tempo at every cue
    var more = [];
    for (k = 0; k < asc.length; k++) {
      var a = asc[k], r = a.r1;
      a.tempo = r.start; a.noteTempo = null;
      if (!a.looping && (Math.abs(r.mid - r.start) > 0.01 || Math.abs(r.end - r.start) > 0.01)) {
        a.noteTempo = [];
        for (var n = 0; n < a.notes.length; n++)
          more.push({ it: a, kind: "note", n: n, pos: a.start + (a.notes[n].start_time - a.marker) });
      }
    }
    if (more.length) { job.samples = more; job.si = 0; job.round = 2;
      status("Tempo changes inside " + countVar(asc) + " clip(s): reading the tempo at each cue..."); readNextTempo(); return; }
  } else {
    for (k = 0; k < job.samples.length; k++) { s = job.samples[k]; s.it.noteTempo[s.n] = s.tempo; }
  }
  new LiveAPI("live_set").set("current_song_time", job.home);
  tempoCache = { scope: scope, sig: sig(asc), clips: asc.map(function (a) { return { tempo: a.tempo, noteTempo: a.noteTempo }; }) };
  doMoves();
}
function countVar(asc) { return asc.filter(function (a) { return a.noteTempo; }).length; }

var probe = null;
function findClipAt(track, tpath, t) {
  // the parked copy is after every other clip, so it's normally the last one: check that first
  var n = track.getcount("arrangement_clips");
  if (!probe) probe = new LiveAPI(tpath);
  for (var i = n - 1; i >= 0; i--) {
    probe.path = tpath + " arrangement_clips " + i;
    if (Math.abs(num(probe, "start_time") - t) < 1e-6) return Number(probe.id);
  }
  return 0;
}

function doMoves() {
  var track = new LiveAPI(job.tpath), moved = 0, corrected = 0, tempos = {};
  // 1) check everything first. All or nothing: if one clip or cue can't move, nothing moves,
  //    so the light clips always stay in step and NOW stays true.
  for (var c = 0; c < job.items.length; c++) {
    var it = job.items[c];
    it.dest = it.start + job.dms * it.tempo / 60000.0;            // ms -> beats at the clip's start tempo
    if (it.dest < 0) { return refuse("a clip sits at the very start of the song and can't go earlier. Leave some empty space before the first light clip."); }
    it.mods = [];
    if (it.noteTempo) {
      for (var n = 0; n < it.notes.length; n++) {
        var note = it.notes[n], tn = it.noteTempo[n];
        if (tn === undefined) continue;
        // extra shift so this cue moves exactly dms at ITS tempo (clip already moves dms at the start tempo)
        var corr = job.dms * (tn - it.tempo) / 60000.0;
        if (Math.abs(corr) < 1e-6) continue;
        var ns = note.start_time + corr;
        var wasIn = note.start_time >= it.lo && note.start_time < it.hi;
        if (wasIn && (ns < it.lo || ns >= it.hi))
          return refuse("a cue at the edge of the clip at bar " + (Math.floor(it.start / 4) + 1) + " would fall outside it. Drag that clip's edge out a little and click again.");
        it.mods.push({ note_id: note.note_id, start_time: ns });
      }
    }
  }
  // 2) do it
  for (var k = 0; k < job.items.length; k++) {
    var it2 = job.items[k];
    var before = track.getcount("arrangement_clips");
    if (it2.mods.length) { new LiveAPI("id " + it2.id).call("apply_note_modifications", { notes: it2.mods }); corrected++; }
    // via a parking spot after the last clip, so a clip never lands on top of itself
    track.call("duplicate_clip_to_arrangement", "id", it2.id, job.temp);
    var tempId = findClipAt(track, job.tpath, job.temp);
    if (!tempId) { fail("could not copy a clip (Live 12 needed)."); return; }
    track.call("delete_clip", "id", it2.id);
    track.call("duplicate_clip_to_arrangement", "id", tempId, it2.dest);
    track.call("delete_clip", "id", tempId);
    if (track.getcount("arrangement_clips") !== before) { fail("clip count changed unexpectedly."); return; }
    moved++;
    tempos[round(it2.tempo, 2)] = 1;
  }
  busy = false;
  total = round(total + job.dms, 2);
  outlet(0, "total", total);
  var t = "Moved " + moved + " clip" + (moved > 1 ? "s" : "") + " by " + job.dms + " ms at " +
          Object.keys(tempos).join(", ") + " BPM.";
  if (corrected) t += " " + corrected + " clip(s) with a tempo change inside: each cue corrected.";
  t += " Total now " + total + " ms.";
  status(t);
}

function refuse(why) {
  busy = false; pending = 0;
  status("NOT moved: " + why);
  outlet(0, "total", total);
}

function fail(why) {
  busy = false; pending = 0; tempoCache = null;
  status("STOPPED: " + why + " Check the track, use Cmd+Z to undo.");
}
