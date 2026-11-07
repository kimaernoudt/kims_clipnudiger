// CABP TEST RIG - builds a test set and acts as a "virtual light".
// BUILD (in a NEW, empty Live set): this track becomes VIRTUAL LIGHT (input IAC, armed, monitor In).
// Two MIDI tracks are added, both sending to IAC Bus 1:
//   LIGHT CUES  note C3 (60) - put the Light Nudge device on this one
//   REF CUES    note D3 (62) - same positions, stands for "everything else", never nudged
// The display shows how many ms LIGHT arrives before/after REF (average of the last 8 cues).
inlets = 1; outlets = 1;
var LIGHT = 60, REF = 62, BEAT_CLIPS = 8, CLIP_LEN = 4, GAP = 8;
var now = 0, pendL = null, pendR = null, diffs = [], count = 0;

function status(t) { outlet(0, "status", t); }
function num(api, p) { return Number(api.get(p)[0]); }

// ---- virtual light ----
function time(t) { now = Number(t); }
function note(p, v) {
  if (Number(v) === 0) return;            // note-offs
  p = Number(p);
  if (p === LIGHT) { outlet(0, "flashL", "bang"); arrive("L"); }
  else if (p === REF) { outlet(0, "flashR", "bang"); arrive("R"); }
}
function arrive(which) {
  count++;
  var other = which === "L" ? pendR : pendL;
  if (other !== null && Math.abs(now - other) < 250) {
    var d = which === "L" ? now - other : other - now;   // LIGHT minus REF
    diffs.push(d); if (diffs.length > 8) diffs.shift();
    var avg = diffs.reduce(function (a, b) { return a + b; }, 0) / diffs.length;
    outlet(0, "diff", Math.round(avg * 10) / 10);
    pendL = null; pendR = null;
  } else if (which === "L") pendL = now; else pendR = now;
}
function clear() { diffs = []; pendL = pendR = null; outlet(0, "diff", 0); status("Cleared."); }

// ---- build the test set ----
function routingList(api, prop) {
  var raw = api.get("available_" + prop + "s"), s = "";
  for (var i = 0; i < raw.length; i++) if (String(raw[i]).charAt(0) === "{") s = String(raw[i]);
  if (!s) s = raw.join(" ").replace(/^available_\S+\s/, "");
  var o = JSON.parse(s);
  return o["available_" + prop + "s"] || o[prop + "s"] || [];
}
function shown(api, prop) {
  try {
    var raw = api.get(prop), s = "";
    for (var i = 0; i < raw.length; i++) if (String(raw[i]).charAt(0) === "{") s = String(raw[i]);
    var o = JSON.parse(s); return (o[prop] || o).display_name || "";
  } catch (e) { return ""; }
}
function setRouting(api, prop, re) {
  var list;
  try { list = routingList(api, prop); } catch (e) { return false; }
  var hit = null;
  for (var i = 0; i < list.length; i++) if (re.test(list[i].display_name)) { hit = list[i]; break; }
  if (!hit) return false;
  try { api.set(prop, { identifier: hit.identifier }); } catch (e) {}
  if (re.test(shown(api, prop))) return true;
  try { api.set(prop, JSON.stringify({ identifier: hit.identifier })); } catch (e) {}
  return re.test(shown(api, prop));
}

function build() {
  var song = new LiveAPI("live_set");
  var nt = song.getcount("tracks");
  for (var i = 0; i < nt; i++) {
    var t = new LiveAPI("live_set tracks " + i);
    if (t.getcount("arrangement_clips") > 0) { status("This set already has clips. Open a NEW empty set first (File > New Live Set)."); return; }
  }
  song.set("tempo", 120);
  var manual = [];

  // this track = VIRTUAL LIGHT
  var me = new LiveAPI("this_device canonical_parent");
  me.set("name", "VIRTUAL LIGHT");
  if (!setRouting(me, "input_routing_type", /IAC/i)) manual.push("VIRTUAL LIGHT input = IAC Driver");
  me.set("current_monitoring_state", 0);
  me.set("arm", 1);

  var made = [["LIGHT CUES", LIGHT], ["REF CUES", REF]];
  for (var m = 0; m < made.length; m++) {
    song.call("create_midi_track", -1);
    var idx = song.getcount("tracks") - 1;
    var tr = new LiveAPI("live_set tracks " + idx);
    tr.set("name", made[m][0]);
    if (!setRouting(tr, "output_routing_type", /IAC/i)) manual.push(made[m][0] + " output = IAC Driver");
    // one session clip with a cue on every beat (first one right at the clip start)
    var slot = new LiveAPI("live_set tracks " + idx + " clip_slots 0");
    slot.call("create_clip", CLIP_LEN);
    var clip = new LiveAPI("live_set tracks " + idx + " clip_slots 0 clip");
    var notes = [];
    for (var b = 0; b < CLIP_LEN; b++) notes.push({ pitch: made[m][1], start_time: b, duration: 0.25, velocity: 100 });
    clip.call("add_new_notes", { notes: notes });
    clip.set("name", made[m][0]);
    for (var c = 0; c < BEAT_CLIPS; c++) tr.call("duplicate_clip_to_arrangement", "id", Number(clip.id), c * GAP);
    slot.call("delete_clip");
  }
  song.set("loop_start", 0);
  song.set("loop_length", BEAT_CLIPS * GAP);
  song.set("loop", 1);
  var t2 = "Built. Drag Light Nudge onto LIGHT CUES, press play.";
  if (manual.length) t2 += " Set by hand: " + manual.join("; ") + ".";
  status(t2);
}
