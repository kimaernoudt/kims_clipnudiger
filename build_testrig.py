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
# arrival: time first (cpuclock), then the note
obj("mp", "midiparse", [130, 60, 80, 20], 1, 8, ["", "", "", "int", "int", "", "int", ""])
line("min", 0, "mp", 0)
obj("tlb", "t l b", [130, 90, 40, 20], 1, 2, ["", "bang"])
line("mp", 0, "tlb", 0)
obj("clk", "cpuclock", [200, 120, 60, 20], 1, 1, ["float"])
line("tlb", 1, "clk", 0)
obj("ptime", "prepend time", [200, 150, 80, 20], 1, 1, [""])
line("clk", 0, "ptime", 0); line("ptime", 0, "code", 0)
obj("pnote", "prepend note", [130, 180, 80, 20], 1, 1, [""])
line("tlb", 0, "pnote", 0); line("pnote", 0, "code", 0)

comment("title", "TEST RIG / VIRTUAL LIGHT", [30, 100, 200, 18], [4, 2, 200, 16], fontsize=10.0)
for bid, label, msg, pres, x in [("bBuild", "BUILD TEST SET", "build", [4, 20, 110, 20], 300), ("bClear", "CLEAR", "clear", [118, 20, 50, 20], 420)]:
    button(bid, label, [x, 20, 90, 20], pres)
    obj(bid + "r", "route bang 1", [x, 45, 75, 20], 1, 3, ["", "", ""])
    box(bid + "m", "message", [x, 70, 50, 20], text=msg, numinlets=2, numoutlets=1, outlettype=[""])
    line(bid, 0, bid + "r", 0); line(bid + "r", 0, bid + "m", 0); line(bid + "r", 1, bid + "m", 0); line(bid + "m", 0, "code", 0)

def flash(id, name, pres, x):
    box(id, "live.button", [x, 800, 30, 30], pres, numinlets=1, numoutlets=1, outlettype=[""], parameter_enable=1,
        varname=name, saved_attribute_attributes={"valueof": {"parameter_longname": name, "parameter_shortname": name,
        "parameter_type": 2, "parameter_enum": ["off", "on"], "parameter_mmax": 1, "parameter_invisible": 1}})
comment("lL", "LIGHT", [600, 780, 40, 18], [4, 46, 40, 16])
flash("fL", "Rig Light", [44, 44, 30, 30], 600)
comment("lR", "REF", [700, 780, 40, 18], [84, 46, 30, 16])
flash("fR", "Rig Ref", [114, 44, 30, 30], 700)
comment("lD", "LIGHT vs REF (ms):", [800, 780, 120, 18], [4, 82, 110, 16])
box("nD", "flonum", [800, 800, 60, 20], [114, 80, 60, 20], numinlets=1, numoutlets=2, outlettype=["", "bang"],
    format=6, fontsize=12.0, ignoreclick=1)

obj("rt", "route flashL flashR diff status", [400, 720, 180, 20], 1, 5, ["", "", "", "", ""])
line("code", 0, "rt", 0); line("rt", 0, "fL", 0); line("rt", 1, "fR", 0); line("rt", 2, "nD", 0)
obj("ps", "prepend set", [500, 760, 80, 20], 1, 1, [""])
line("rt", 3, "ps", 0)
comment("status", "New empty Live set, then BUILD TEST SET.", [500, 850, 250, 50], [4, 106, 220, 56], fontsize=9.0, linecount=4)
line("ps", 0, "status", 0)

params = {b["box"]["id"]: [b["box"]["varname"], b["box"]["saved_attribute_attributes"]["valueof"]["parameter_shortname"], 0]
          for b in boxes if b["box"].get("parameter_enable") == 1}
params["inherited_shortname"] = 1
patcher = {"patcher": {
  "fileversion": 1, "appversion": {"major": 9, "minor": 0, "revision": 9, "architecture": "x64", "modernui": 1},
  "classnamespace": "box", "rect": [100.0, 100.0, 1100.0, 900.0], "openrect": [0.0, 0.0, 230.0, 169.0],
  "openinpresentation": 1, "default_fontsize": 10.0, "default_fontname": "Arial Bold", "gridsize": [8.0, 8.0],
  "statusbarvisible": 0, "boxanimatetime": 500, "devicewidth": 230.0,
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
