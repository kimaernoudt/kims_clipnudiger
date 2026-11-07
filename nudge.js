// CABP LIGHT NUDGE - moves Arrangement MIDI clips on this track earlier/later in ms.
// Edits the arrangement only when you click. Does nothing while the set plays:
// no delay, no latency, MIDI passes straight through.
inlets = 1; outlets = 1;
var stepMs = 1, targetMs = 0, scope = 0, total = 0, busy = false, job = null, timer = null;
var pending = 0, tempoCache = null;   // clicks made while busy are added up and run after

function setstep(v) { stepMs = Math.max(0.1, Number(v)); }
function settarget(v) { targetMs = Number(v); }
function setscope(v) { scope = Number(v); tempoCache = null; }
function settotal(v) { total = Number(v); }
function back() { queue(-stepMs); }          // earlier
function fwd() { queue(stepMs); }            // later
function goto() { queue(round(targetMs - total - pending, 2)); }
function reset() {
  if (Math.abs(total + pending) < 0.001) { status("Already at 0 ms."); return; }
  queue(-(total + pending));
}
function queue(d) {
  if (!d) { status("Nothing to move."); return; }
  if (busy) { pending = round(pending + d, 2); status("Queued " + pending + " ms..."); return; }
  start(d);
}
function status(t) { outlet(0, "status", t); }
function num(api, prop) { return Number(api.get(prop)[0]); }
function ok(api) { return api && api.id && Number(api.id) !== 0; }
function round(x, d) { var m = Math.pow(10, d); return Math.round(x * m) / m; }

function start(dms) {
  var song = new LiveAPI("live_set");
  if (num(song, "is_playing") === 1) { pending = 0; status("Stop playback first (safety), then click again."); return; }

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

  var tempoParam = new LiveAPI("live_set master_track mixer_device song_tempo");
  var automated = ok(tempoParam) && num(tempoParam, "automation_state") !== 0;
  job = { dms: dms, items: items, tpath: tpath, temp: Math.ceil(trackEnd) + 64,
          automated: automated, idx: 0, home: num(song, "current_song_time") };
  busy = true;
  if (!automated) {
    var t = num(song, "tempo");
    for (var k = 0; k < items.length; k++) items[k].tempo = t;
    doMoves();
  } else if (tempoCache && tempoCache.length === items.length && tempoCache.scope === scope) {
    // same clips as last time (order never changes): reuse the tempos read before
    var ordered = items.slice().sort(function (x, y) { return x.start - y.start; });
    for (var q = 0; q < ordered.length; q++) ordered[q].tempo = tempoCache[q];
    doMoves();
  } else {
    status("Tempo automation found: reading the tempo at each clip...");
    readNextTempo();
  }
}

// tempo is automated: park the playhead on each clip, wait, read the tempo there
function readNextTempo() {
  var song = new LiveAPI("live_set");
  if (job.idx >= job.items.length) {
    song.set("current_song_time", job.home);
    var ordered = job.items.slice().sort(function (x, y) { return x.start - y.start; });
    tempoCache = ordered.map(function (o) { return o.tempo; }); tempoCache.scope = scope;
    doMoves(); return;
  }
  song.set("current_song_time", job.items[job.idx].start + 0.001);
  timer = new Task(function () {
    job.items[job.idx].tempo = num(new LiveAPI("live_set"), "tempo");
    job.idx++;
    readNextTempo();
  }, this);
  timer.schedule(150);
}

function findClipAt(track, tpath, t) {
  var n = track.getcount("arrangement_clips");
  for (var i = 0; i < n; i++) {
    var a = new LiveAPI(tpath + " arrangement_clips " + i);
    if (Math.abs(num(a, "start_time") - t) < 1e-6) return Number(a.id);
  }
  return 0;
}

function doMoves() {
  var track = new LiveAPI(job.tpath), moved = 0, skipped = 0, tempos = {};
  // all or nothing: if one clip can't move (it would go before the song start), move none,
  // so the light clips always stay in step with each other and NOW stays true
  for (var c = 0; c < job.items.length; c++) {
    job.items[c].dest = job.items[c].start + job.dms * job.items[c].tempo / 60000.0;   // ms -> beats at that clip's tempo
    if (job.items[c].dest < 0) {
      busy = false; pending = 0;
      status("NOT moved: a clip sits at the very start of the song and can't go earlier. Leave some empty space before the first light clip.");
      return;
    }
  }
  for (var k = 0; k < job.items.length; k++) {
    var it = job.items[k];
    var dest = it.dest;
    var before = track.getcount("arrangement_clips");
    // via a parking spot after the last clip, so a clip never lands on top of itself
    track.call("duplicate_clip_to_arrangement", "id", it.id, job.temp);
    var tempId = findClipAt(track, job.tpath, job.temp);
    if (!tempId) { fail("could not copy a clip (Live 12 needed)."); return; }
    track.call("delete_clip", "id", it.id);
    track.call("duplicate_clip_to_arrangement", "id", tempId, dest);
    track.call("delete_clip", "id", tempId);
    if (track.getcount("arrangement_clips") !== before) { fail("clip count changed unexpectedly."); return; }
    moved++;
    tempos[round(it.tempo, 2)] = 1;
  }
  busy = false;
  if (!moved) { pending = 0; status("Nothing moved." + (skipped ? " Clip would go before the song start." : "")); return; }
  total = round(total + job.dms, 2);
  outlet(0, "total", total);
  var t = "Moved " + moved + " clip" + (moved > 1 ? "s" : "") + " by " + job.dms + " ms at " +
          Object.keys(tempos).join(", ") + " BPM" + (job.automated ? " (tempo automation, per clip)" : "") + ".";
  if (skipped) t += " " + skipped + " clip(s) NOT moved (would go before song start).";
  t += " Total now " + total + " ms.";
  status(t);
  if (pending) { var d = pending; pending = 0; start(d); }
}

function fail(why) {
  busy = false; pending = 0; tempoCache = null;
  status("STOPPED: " + why + " Check the track, use Cmd+Z to undo.");
}
