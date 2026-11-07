import json, struct, sys
code = open(sys.argv[1]).read()
boxes, lines = [], []
def box(id, cls, rect, pres=None, **kw):
    b = {"id": id, "maxclass": cls, "patching_rect": rect}
    b.update(kw)
    if pres: b["presentation"] = 1; b["presentation_rect"] = pres
    boxes.append({"box": b}); return id
def obj(id, text, rect, ni, no, ot):
    return box(id, "newobj", rect, text=text, numinlets=ni, numoutlets=no, outlettype=ot)
def line(a, ao, b, bi): lines.append({"patchline": {"source": [a, ao], "destination": [b, bi]}})
def numbox(id, name, short, rect, pres, lo, hi, init, typ=0, unit=1, **kw):
    return box(id, "live.numbox", rect, pres, numinlets=1, numoutlets=2, outlettype=["", "float"],
               parameter_enable=1, varname=name,
               saved_attribute_attributes={"valueof": {"parameter_longname": name, "parameter_shortname": short,
                 "parameter_type": typ, "parameter_mmin": lo, "parameter_mmax": hi, "parameter_initial": [init],
                 "parameter_initial_enable": 1, "parameter_unitstyle": unit}}, **kw)
def button(id, label, rect, pres):
    return box(id, "live.text", rect, pres, numinlets=1, numoutlets=2, outlettype=["", ""], parameter_enable=0,
               mode=0, text=label, texton=label, fontsize=10.0)
def comment(id, text, rect, pres, **kw):
    return box(id, "comment", rect, pres, text=text, numinlets=1, numoutlets=0, outlettype=[], **kw)

# MIDI passes straight through
obj("min", "midiin", [30, 20, 50, 20], 1, 1, ["int"]); obj("mout", "midiout", [30, 60, 55, 20], 1, 0, [])
line("min", 0, "mout", 0)

box("code", "v8.codebox", [400, 300, 600, 400], code=code, filename="none", fontface=0, fontname="<Monospaced>",
    fontsize=11.0, numinlets=1, numoutlets=1, outlettype=[""], saved_object_attributes={"parameter_enable": 0})

comment("title", "LIGHT NUDGE", [30, 100, 300, 18], [4, 2, 120, 16], fontsize=11.0)
# layout: big EARLIER / LATER on top, red BACK TO 0 across the bottom
buttons = [("bBack", "< EARLIER", "back", [4, 20, 121, 38], 14.0, None),
           ("bFwd", "LATER >", "fwd", [127, 20, 121, 38], 14.0, None),
           ("bSet", "SET", "goto", [198, 63, 50, 18], 10.0, None),
           ("bZero", "BACK TO 0", "reset", [4, 145, 244, 22], 12.0, [0.85, 0.12, 0.12, 1.0])]
for i, (bid, label, msg, pres, fs, red) in enumerate(buttons):
    x = 30 + i * 110
    button(bid, label, [x, 140, 90, 22], pres)
    boxes[-1]["box"]["fontsize"] = fs
    if red:
        boxes[-1]["box"].update({"bgcolor": red, "bgoncolor": red, "activebgcolor": red, "activebgoncolor": red,
                                 "textcolor": [1.0, 1.0, 1.0, 1.0], "textoncolor": [1.0, 1.0, 1.0, 1.0],
                                 "activetextcolor": [1.0, 1.0, 1.0, 1.0], "activetextoncolor": [1.0, 1.0, 1.0, 1.0]})
    obj(bid + "r", "route bang 1", [x, 170, 75, 20], 1, 3, ["", "", ""])
    box(bid + "m", "message", [x, 200, 50, 20], text=msg, numinlets=2, numoutlets=1, outlettype=[""])
    line(bid, 0, bid + "r", 0); line(bid + "r", 0, bid + "m", 0); line(bid + "r", 1, bid + "m", 0); line(bid + "m", 0, "code", 0)

comment("lTgt", "type ms:", [600, 100, 60, 18], [4, 64, 60, 16])
numbox("nTgt", "Nudge Target", "Target", [600, 140, 50, 15], [64, 64, 70, 16], -1000.0, 1000.0, 0.0)
comment("lTot", "NOW:", [700, 100, 40, 18], [4, 85, 52, 24], fontsize=18.0)
numbox("nTot", "Nudge Total", "Total", [700, 140, 50, 15], [58, 82, 190, 28], -10000.0, 10000.0, 0.0,
       ignoreclick=1, fontsize=20.0)
box("tScope", "live.tab", [800, 140, 100, 18], [150, 1, 98, 17], numinlets=1, numoutlets=3,
    outlettype=["", "", "float"], parameter_enable=1, varname="Nudge Scope", num_lines_patching=1, num_lines_presentation=1,
    saved_attribute_attributes={"valueof": {"parameter_longname": "Nudge Scope", "parameter_shortname": "Scope",
      "parameter_type": 2, "parameter_enum": ["TRACK", "CLIP"], "parameter_mmax": 1, "parameter_unitstyle": 9}})
for nid, pre, x in [("nTgt", "settarget", 600), ("nTot", "settotal", 700), ("tScope", "setscope", 800)]:
    obj(nid + "p", "prepend " + pre, [x, 240, 90, 20], 1, 1, [""])
    line(nid, 0, nid + "p", 0); line(nid + "p", 0, "code", 0)

obj("rt", "route total status", [400, 720, 110, 20], 1, 3, ["", "", ""])
line("code", 0, "rt", 0); line("rt", 0, "nTot", 0)
obj("ps", "prepend set", [500, 760, 80, 20], 1, 1, [""])
line("rt", 1, "ps", 0)
comment("status", "Stop playback, then click < or >. Cmd+Z undoes.", [500, 800, 250, 50], [4, 112, 244, 32],
        fontsize=9.0, linecount=3)
line("ps", 0, "status", 0)

params = {b["box"]["id"]: [b["box"]["varname"], b["box"]["saved_attribute_attributes"]["valueof"]["parameter_shortname"], 0]
          for b in boxes if b["box"].get("parameter_enable") == 1}
params["inherited_shortname"] = 1
patcher = {"patcher": {
  "fileversion": 1, "appversion": {"major": 9, "minor": 0, "revision": 9, "architecture": "x64", "modernui": 1},
  "classnamespace": "box", "rect": [100.0, 100.0, 1100.0, 900.0], "openrect": [0.0, 0.0, 252.0, 169.0],
  "openinpresentation": 1, "default_fontsize": 10.0, "default_fontname": "Arial Bold", "gridsize": [8.0, 8.0],
  "statusbarvisible": 0, "boxanimatetime": 500, "devicewidth": 252.0,
  "boxes": boxes, "lines": lines, "parameters": params, "dependency_cache": [], "latency": 0, "is_mpe": 0,
  "external_mpe_tuning_enabled": 0, "minimum_live_version": "", "minimum_max_version": "", "platform_compatibility": 0,
  "project": {"version": 1, "creationdate": 2082825104, "modificationdate": 2082825104, "viewrect": [0.0, 0.0, 300.0, 500.0],
    "autoorganize": 1, "hideprojectwindow": 1, "showdependencies": 1, "autolocalize": 0, "contents": {"patchers": {}},
    "layout": {}, "searchpath": {}, "detailsvisible": 0, "amxdtype": 1835887981, "readonly": 1, "devpathtype": 0,
    "devpath": ".", "sortmode": 0, "viewmode": 0, "includepackages": 0},
  "autosave": 0}}
js = (json.dumps(patcher, indent="\t") + "\n").encode() + b"\x00"
out = b"ampf" + struct.pack("<I", 4) + b"mmmm" + b"meta" + struct.pack("<I", 4) + struct.pack("<I", 1) + b"ptch" + struct.pack("<I", len(js)) + js
open(sys.argv[2], "wb").write(out)
print(len(out))
