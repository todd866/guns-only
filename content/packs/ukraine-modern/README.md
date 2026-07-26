# Ukraine modern — fictional training-sector terrain

This content is a synthetic, fictionalized Ukrainian lowland grammar for `guns-only`. It is not a
reconstruction of a real locality, does not encode live unit positions or tactical infrastructure,
and is unsuitable for real navigation or operations.

`environment/terrain/soniachne-steppe.*` contains the 16.384 km square Soniachne Steppe training
cell:

- 32 m simulation truth, with no vertical exaggeration;
- four 8.192 km visual chunks with 32/64/128/256 m LODs;
- deterministic rolling lowland, drainage and eastern relief;
- a generated preview and hashes in the manifest.

The browser adds a one-draw 78 m land-horizon apron outside the detailed cell. WebBridge supplies a
matching coarse collision/AGL apron. Neither apron is authored terrain and neither may host targets,
obstacles, navigation claims or medevac landing zones.

Regenerate the pack from the repository root:

```sh
python3 tools/terrain/build_ukraine_training_sector.py
```

